"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchool } from "@/lib/auth/session";
import { guardianUsers, notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";
import { todayInAccra } from "@/lib/utils";
import { friendlyDbError } from "@/lib/validation/school";

const STATUS = z.enum(["present", "absent", "late", "excused"]);

/** Saves a whole class register for one day. RLS limits teachers to classes they teach. */
export async function saveRegister(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchool();
  if (school.schoolStatus !== "active" || !(school.permissions.has("attendance.record") || school.permissions.has("attendance.manage"))) {
    return { ok: false, message: "You don't have permission to take attendance." };
  }
  const head = z.object({ classId: z.uuid(), date: z.iso.date() }).safeParse(Object.fromEntries(formData));
  if (!head.success) return { ok: false, message: "Choose a class and date." };
  const todayAccra = todayInAccra();
  if (head.data.date > todayAccra) return { ok: false, message: "You can't record attendance for a future date." };

  const rows: { school_id: string; student_id: string; class_id: string; attendance_date: string; status: string; remark: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^status:([0-9a-f-]{36})$/i.exec(key);
    if (!m) continue;
    const status = STATUS.safeParse(value);
    if (!status.success) return { ok: false, message: "Invalid attendance status." };
    const remark = String(formData.get(`remark:${m[1]}`) ?? "").trim().slice(0, 200);
    rows.push({ school_id: school.schoolId, student_id: m[1], class_id: head.data.classId, attendance_date: head.data.date, status: status.data, remark: remark || null });
  }
  if (!rows.length) return { ok: false, message: "There are no students in this register." };
  if (rows.length > 300) return { ok: false, message: "Register too large." };

  const supabase = await createClient();
  const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,attendance_date" });
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only take attendance for classes you teach." : friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "attendance.recorded", p_entity_type: "school_class", p_entity_id: head.data.classId, p_summary: `Attendance for ${head.data.date} (${rows.length} students)`, p_school_id: school.schoolId });
  revalidatePath("/school/attendance");
  const absentees = rows.filter((r) => r.status === "absent").map((r) => r.student_id);
  if (absentees.length && head.data.date === todayAccra) {
    await notifyUsers({ schoolId: school.schoolId, userIds: await guardianUsers(absentees), category: "attendance", title: "Absence today", body: `Your child was marked absent on ${head.data.date}. Please contact the school if this is unexpected.`, link: "/parent" });
  }
  const absent = rows.filter((r) => r.status === "absent").length;
  return { ok: true, message: `Register saved: ${rows.length - absent} present or late, ${absent} absent.` };
}
