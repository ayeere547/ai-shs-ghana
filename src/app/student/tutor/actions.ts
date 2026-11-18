"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { chat, moderate, type ChatMessage, type ContentPart } from "@/lib/ai/client";
import { aiConfig } from "@/lib/ai/config";
import { extractCitations, formatSources, PROMPT_VERSIONS, tutorSystemPrompt } from "@/lib/ai/prompts";
import { BLOCKED_REPLY, localSafetyCheck, SAFETY_REPLY, TUTOR_IMAGE_MAX_BYTES, TUTOR_IMAGE_TYPES } from "@/lib/ai/safety";
import { aiAccess, aiErrorMessage, logUsage, retrieve } from "@/lib/ai/service";
import { requireStudent } from "@/lib/student";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

export async function newConversation(formData: FormData) {
  const { school } = await requireStudent();
  const subjectId = z.uuid().nullable().catch(null).parse(formData.get("subjectId") || null);
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_tutor_conversations").insert({ school_id: school.schoolId, subject_id: subjectId }).select("id").single();
  if (error || !data) redirect("/student/tutor?error=start");
  redirect(`/student/tutor?c=${data.id}`);
}

export async function deleteConversation(formData: FormData) {
  await requireStudent();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("ai_tutor_conversations").delete().eq("id", id.data);
  redirect("/student/tutor");
}

/**
 * One tutor turn. The conversation is loaded with the student's own session (RLS proves
 * ownership); messages and usage are then written with the service role.
 */
export async function sendMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, school, student } = await requireStudent();
  const input = z.object({ conversationId: z.uuid(), text: z.string().trim().min(1, "Type your question").max(4000, "Keep it under 4,000 characters") }).safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "image")));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };
  const { conversationId, text } = input.data;

  const supabase = await createClient();
  const { data: conv } = await supabase.from("ai_tutor_conversations").select("id, subject_id, title, school_subjects(name)").eq("id", conversationId).maybeSingle<{ id: string; subject_id: string | null; title: string; school_subjects: { name: string } | null }>();
  if (!conv) return { ok: false, message: "Conversation not found." };

  const access = await aiAccess(school.schoolId, "tutor");
  if (!access.ok) return { ok: false, message: access.reason };

  // Optional image (sent to the model, never stored).
  let image: ContentPart | null = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!TUTOR_IMAGE_TYPES.includes(file.type)) return { ok: false, message: "Attach a PNG, JPEG or WebP image." };
    if (file.size > TUTOR_IMAGE_MAX_BYTES) return { ok: false, message: "Images must be 4 MB or smaller." };
    image = { type: "image_url", image_url: { url: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`, detail: "low" } };
  }

  const admin = createAdminClient();
  const cfg = aiConfig();
  const ctx = { schoolId: school.schoolId, userId: session.userId };
  const save = async (rows: { role: "user" | "assistant"; content: string; citations?: unknown; flagged?: boolean; flag_reason?: string | null }[]) => {
    await admin.from("ai_tutor_messages").insert(rows.map((r) => ({ conversation_id: conversationId, school_id: school.schoolId, citations: [], flagged: false, flag_reason: null, ...r })));
    await admin
      .from("ai_tutor_conversations")
      .update({ last_message_at: new Date().toISOString(), ...(conv.title === "New conversation" ? { title: text.slice(0, 80) } : {}) })
      .eq("id", conversationId);
  };
  const userText = image ? `${text}\n\n[Image attached]` : text;

  // 1. Safety: local check, then provider moderation.
  let safety = localSafetyCheck(text);
  if (!safety.concern && cfg.moderationEnabled) {
    try {
      const m = await moderate(text, cfg.models.moderation);
      await logUsage({ ...ctx, feature: "moderation", model: cfg.models.moderation });
      if (m.flagged) safety = { concern: m.categories.some((c) => c.startsWith("self-harm")) ? "self_harm" : "moderation", categories: m.categories };
    } catch {
      // moderation unavailable — local checks still apply
    }
  }
  if (safety.concern) {
    const caring = safety.concern === "self_harm" || safety.concern === "abuse";
    await save([
      { role: "user", content: userText, flagged: true, flag_reason: safety.categories.join(", ") || safety.concern },
      { role: "assistant", content: caring ? SAFETY_REPLY : BLOCKED_REPLY },
    ]);
    await logUsage({ ...ctx, feature: "tutor", model: "safety-filter", promptVersion: PROMPT_VERSIONS.tutor, status: "blocked" });
    if (caring) await notifySafeguarding(school.schoolId, student?.first_name ?? "A student");
    revalidatePath("/student/tutor");
    return { ok: true };
  }

  // 2. Retrieval and history.
  const subject = conv.school_subjects?.name ?? null;
  const [sources, { data: history }, { data: cls }] = await Promise.all([
    retrieve(ctx, text, subject),
    supabase.from("ai_tutor_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10),
    student?.class_id ? supabase.from("school_classes").select("form_level").eq("id", student.class_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const messages: ChatMessage[] = [
    { role: "system", content: tutorSystemPrompt({ subject, formLevel: cls?.form_level ?? null, schoolName: school.schoolName }) },
    { role: "system", content: formatSources(sources) },
    ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: image ? [{ type: "text", text }, image] : text },
  ];

  // 3. Model call.
  try {
    const res = await chat({ model: cfg.models.tutor, messages, maxTokens: 900, temperature: 0.4 });
    await logUsage({ ...ctx, feature: "tutor", model: res.model, promptVersion: PROMPT_VERSIONS.tutor, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens });
    const reply = res.text.trim() || "Sorry, I couldn't come up with an answer. Could you rephrase the question?";
    await save([{ role: "user", content: userText }, { role: "assistant", content: res.truncated ? `${reply}\n\n(My answer was cut short — ask me to continue.)` : reply, citations: extractCitations(reply, sources) }]);
  } catch (error) {
    await logUsage({ ...ctx, feature: "tutor", model: cfg.models.tutor, promptVersion: PROMPT_VERSIONS.tutor, status: "error" });
    return { ok: false, message: aiErrorMessage(error) };
  }
  revalidatePath("/student/tutor");
  return { ok: true };
}

/** Alerts the school's safeguarding staff (no message content is included in the notification). */
async function notifySafeguarding(schoolId: string, firstName: string) {
  const admin = createAdminClient();
  const { data: roles } = await admin.from("role_permissions").select("role_id").eq("permission_key", "ai.safeguarding");
  const roleIds = (roles ?? []).map((r) => r.role_id as string);
  if (!roleIds.length) return;
  const { data: staff } = await admin.from("school_memberships").select("user_id").eq("school_id", schoolId).eq("status", "active").in("role_id", roleIds);
  const users = [...new Set((staff ?? []).map((s) => s.user_id as string))];
  if (users.length) {
    await admin.from("notifications").insert(users.map((user_id) => ({ user_id, school_id: schoolId, title: "AI tutor safeguarding alert", body: `${firstName} wrote something that may need a caring follow-up.`, link: "/school/safeguarding" })));
  }
}
