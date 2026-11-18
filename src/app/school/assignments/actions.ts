"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchool } from "@/lib/auth/session";
import { classUsers, notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

async function requireTeacher() {
  const ctx = await requireSchool();
  const p = ctx.school.permissions;
  if (ctx.school.schoolStatus !== "active" || !(p.has("classroom.teach") || p.has("classroom.manage"))) redirect("/school?denied=1");
  return ctx;
}

/** <input type="datetime-local"> values are Ghana time (UTC+0, no DST). */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time")
  .transform((v) => new Date(`${v}:00Z`).toISOString());

const assignmentSchema = z.object({
  classId: z.uuid(),
  subjectId: z.uuid(),
  title: z.string().trim().min(2, "Enter a title").max(160),
  instructions: z.string().trim().min(1, "Write the instructions").max(10000),
  dueAt: localDateTime,
  maxScore: z.coerce.number().positive().max(1000),
  allowLate: z.literal("on").optional(),
});

export async function createAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireTeacher();
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .insert({ school_id: school.schoolId, class_id: v.classId, subject_id: v.subjectId, title: v.title, instructions: v.instructions, due_at: v.dueAt, max_score: v.maxScore, allow_late: v.allowLate === "on" })
    .select("id")
    .single();
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only set assignments for subjects you teach." : friendlyDbError(error.message), values: formValues(formData) };
  revalidatePath("/school/assignments");
  await notifyUsers({ schoolId: school.schoolId, userIds: await classUsers(v.classId, false), category: "coursework", title: `New assignment: ${v.title}`, body: `Due ${new Date(v.dueAt).toUTCString().slice(0, 22)}.`, link: `/student/assignments/${data.id}` });
  redirect(`/school/assignments/${data.id}`);
}

export async function updateAssignment(formData: FormData) {
  const { school } = await requireTeacher();
  const input = z.object({ id: z.uuid(), op: z.enum(["allow_late", "disallow_late", "delete"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  if (input.data.op === "delete") {
    await supabase.from("assignments").delete().eq("id", input.data.id).eq("school_id", school.schoolId);
    redirect("/school/assignments");
  }
  await supabase.from("assignments").update({ allow_late: input.data.op === "allow_late" }).eq("id", input.data.id).eq("school_id", school.schoolId);
  revalidatePath(`/school/assignments/${input.data.id}`);
}

export async function markSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireTeacher();
  const input = z
    .object({ submissionId: z.uuid(), assignmentId: z.uuid(), score: z.coerce.number().min(0, "Enter a score"), feedback: z.string().trim().max(5000).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return fieldErrors(input.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_submission", { p_submission: input.data.submissionId, p_score: input.data.score, p_feedback: input.data.feedback ?? null });
  if (error) return { ok: false, message: /between/.test(error.message) ? error.message.replace(/^score/, "Score") : friendlyDbError(error.message) };
  revalidatePath(`/school/assignments/${input.data.assignmentId}`);
  return { ok: true, message: "Marked and returned to the student." };
}
