import "server-only";

import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { DEFAULT_PREFERENCES, isEmailConfigured, isSmsConfigured, sendEmail, sendSms, shouldDeliver, smsText, type Category, type Preferences } from "./channels";

/**
 * Central notification engine. In-app notifications are written immediately; email and SMS are
 * queued in notification_outbox (per the user's preferences) and delivered by the cron route, so
 * a slow provider never delays the action that triggered the notice. Failures never throw.
 */
export async function notifyUsers(opts: { schoolId: string | null; userIds: string[]; category: Category; title: string; body: string; link?: string | null }) {
  const users = [...new Set(opts.userIds.filter(Boolean))];
  if (!users.length) return;
  try {
    const admin = createAdminClient();
    for (let i = 0; i < users.length; i += 500) {
      const batch = users.slice(i, i + 500);
      await admin.from("notifications").insert(batch.map((user_id) => ({ user_id, school_id: opts.schoolId, title: opts.title.slice(0, 200), body: opts.body.slice(0, 1000), link: opts.link ?? null })));
      if (!isEmailConfigured() && !isSmsConfigured()) continue;
      const [{ data: prefs }, { data: profiles }] = await Promise.all([
        admin.from("notification_preferences").select("user_id, email_enabled, sms_enabled, sms_phone, categories").in("user_id", batch),
        admin.from("profiles").select("id, email").in("id", batch).eq("status", "active"),
      ]);
      const prefFor = new Map((prefs ?? []).map((p) => [p.user_id as string, p as unknown as Preferences]));
      const rows: Record<string, unknown>[] = [];
      for (const p of profiles ?? []) {
        const pref = prefFor.get(p.id) ?? DEFAULT_PREFERENCES;
        if (isEmailConfigured() && p.email && shouldDeliver(pref, opts.category, "email")) {
          rows.push({ school_id: opts.schoolId, user_id: p.id, channel: "email", category: opts.category, destination: p.email, subject: opts.title, body: `${opts.body}${opts.link ? `\n\n${publicEnv.siteUrl}${opts.link}` : ""}\n\nChange which notices you receive in My account → Notifications.` });
        }
        if (isSmsConfigured() && pref.sms_phone && shouldDeliver(pref, opts.category, "sms")) {
          rows.push({ school_id: opts.schoolId, user_id: p.id, channel: "sms", category: opts.category, destination: pref.sms_phone, body: smsText(opts.title, opts.body, opts.link, publicEnv.siteUrl) });
        }
      }
      if (rows.length) await admin.from("notification_outbox").insert(rows);
    }
  } catch (error) {
    console.error("notifyUsers failed", (error as Error).message);
  }
}

/** Delivers queued email/SMS. Called by the cron route; safe to run concurrently-ish (small batches). */
export async function deliverOutbox(limit = 100) {
  const admin = createAdminClient();
  const { data: pending } = await admin.from("notification_outbox").select("id, channel, destination, subject, body, attempts").eq("status", "pending").order("created_at").limit(limit);
  let sent = 0;
  let failed = 0;
  for (const m of pending ?? []) {
    try {
      if (m.channel === "email") await sendEmail(m.destination, m.subject ?? "AI SHS Ghana", m.body);
      else await sendSms(m.destination, m.body);
      await admin.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: m.attempts + 1 }).eq("id", m.id);
      sent++;
    } catch (error) {
      const attempts = m.attempts + 1;
      await admin.from("notification_outbox").update({ status: attempts >= 3 ? "failed" : "pending", attempts, last_error: (error as Error).message.slice(0, 300) }).eq("id", m.id);
      failed++;
    }
  }
  return { processed: pending?.length ?? 0, sent, failed };
}

/* ------------------------------ recipient helpers ----------------------------- */

/** Sign-in accounts of guardians allowed to view these students. */
export async function guardianUsers(studentIds: string[]) {
  if (!studentIds.length) return [];
  const { data } = await createAdminClient().from("student_guardians").select("guardians!inner(user_id)").in("student_id", studentIds).eq("can_view_records", true).returns<{ guardians: { user_id: string | null } }[]>();
  return (data ?? []).map((d) => d.guardians.user_id).filter(Boolean) as string[];
}

/** Student accounts in a class, and optionally their guardians. */
export async function classUsers(classId: string, includeGuardians = true) {
  const { data } = await createAdminClient().from("students").select("id, user_id").eq("class_id", classId).eq("status", "active");
  const students = (data ?? []).map((s) => s.user_id).filter(Boolean) as string[];
  return includeGuardians ? [...students, ...(await guardianUsers((data ?? []).map((s) => s.id)))] : students;
}

/** Members of a school for an audience: everyone, staff only, or students (+ staff). */
export async function schoolAudience(schoolId: string, audience: "all" | "staff" | "students") {
  const { data } = await createAdminClient().from("school_memberships").select("user_id, roles!inner(key)").eq("school_id", schoolId).eq("status", "active").returns<{ user_id: string; roles: { key: string } }[]>();
  return (data ?? []).filter((m) => audience === "all" || (audience === "staff" ? !["student", "parent"].includes(m.roles.key) : m.roles.key !== "parent")).map((m) => m.user_id);
}
