"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchool } from "@/lib/auth/session";
import { classUsers, notifyUsers } from "@/lib/notify";
import { parseQuestionForm } from "@/lib/exams/questions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

async function requireTeacher() {
  const ctx = await requireSchool();
  const p = ctx.school.permissions;
  if (ctx.school.schoolStatus !== "active" || !(p.has("classroom.teach") || p.has("classroom.manage"))) redirect("/school?denied=1");
  return ctx;
}

const dbMessage = (m: string) =>
  /row-level security/.test(m) ? "You can only do this for subjects you teach." : /no longer be changed|already started|Finish marking|has no questions|Set the exam/.test(m) ? m : friendlyDbError(m);

/* ------------------------------ question bank ------------------------------ */

export async function saveQuestion(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireTeacher();
  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, values: formValues(formData) };
  const supabase = await createClient();
  const { error } = await supabase.from("questions").insert({ ...parsed.row, school_id: school.schoolId });
  if (error) return { ok: false, message: dbMessage(error.message), values: formValues(formData) };
  revalidatePath("/school/questions");
  revalidatePath("/school/exams", "layout");
  return { ok: true, message: "Question added to the bank." };
}

export async function deleteQuestion(formData: FormData) {
  const { school } = await requireTeacher();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", id.data).eq("school_id", school.schoolId);
  revalidatePath("/school/questions");
}

/* ---------------------------------- exams ---------------------------------- */

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time").transform((v) => new Date(`${v}:00Z`).toISOString());

const examSchema = z
  .object({
    classId: z.uuid(),
    subjectId: z.uuid(),
    termId: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
    title: z.string().trim().min(2, "Enter a title").max(160),
    kind: z.enum(["class_test", "mid_term", "end_of_term", "mock", "wassce_practice"]),
    instructions: z.string().trim().max(5000).optional().transform((v) => v || null),
    durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(360),
    opensAt: localDateTime,
    closesAt: localDateTime,
    shuffle: z.literal("on").optional(),
  })
  .refine((v) => v.closesAt > v.opensAt, { path: ["closesAt"], message: "Must be after the opening time" });

export async function createExam(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireTeacher();
  const parsed = examSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exams")
    .insert({
      school_id: school.schoolId, class_id: v.classId, subject_id: v.subjectId, term_id: v.termId, title: v.title, kind: v.kind, instructions: v.instructions,
      duration_minutes: v.durationMinutes, opens_at: v.opensAt, closes_at: v.closesAt, shuffle_questions: v.shuffle === "on",
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbMessage(error.message), values: formValues(formData) };
  redirect(`/school/exams/${data.id}`);
}

export async function examAction(formData: FormData) {
  const { school } = await requireTeacher();
  const input = z.object({ examId: z.uuid(), op: z.enum(["publish", "unpublish", "delete", "finalise", "release", "withdraw"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const { examId, op } = input.data;
  const supabase = await createClient();
  if (op === "delete") {
    const { error } = await supabase.from("exams").delete().eq("id", examId).eq("school_id", school.schoolId);
    if (!error) redirect("/school/exams");
    redirect(`/school/exams/${examId}?error=${encodeURIComponent("Exams that students have started can't be deleted.")}`);
  }
  let error: { message: string } | null = null;
  if (op === "publish" || op === "unpublish") {
    if (op === "publish") {
      const { count } = await supabase.from("exam_questions").select("id", { count: "exact", head: true }).eq("exam_id", examId);
      if (!count) redirect(`/school/exams/${examId}?error=${encodeURIComponent("Add questions before publishing.")}`);
    }
    ({ error } = await supabase.from("exams").update({ is_published: op === "publish" }).eq("id", examId).eq("school_id", school.schoolId));
  } else if (op === "finalise") ({ error } = await supabase.rpc("finalise_expired_attempts", { p_exam: examId }));
  else ({ error } = await supabase.rpc("release_exam_results", { p_exam: examId, p_release: op === "release" }));
  revalidatePath(`/school/exams/${examId}`, "layout");
  if (!error && (op === "publish" || op === "release")) {
    const { data: e } = await supabase.from("exams").select("title, class_id, opens_at").eq("id", examId).single();
    if (e) {
      await notifyUsers(op === "publish"
        ? { schoolId: school.schoolId, userIds: await classUsers(e.class_id, false), category: "coursework", title: `Exam scheduled: ${e.title}`, body: `Opens ${new Date(e.opens_at).toUTCString().slice(0, 22)} (GMT).`, link: `/student/exams/${examId}` }
        : { schoolId: school.schoolId, userIds: await classUsers(e.class_id), category: "results", title: `Exam results: ${e.title}`, body: "Marked papers are now available to review.", link: `/student/exams/${examId}` });
    }
  }
  if (error) redirect(`/school/exams/${examId}?error=${encodeURIComponent(dbMessage(error.message))}`);
}

export async function addExamQuestions(formData: FormData) {
  const { school } = await requireTeacher();
  const examId = z.uuid().safeParse(formData.get("examId"));
  const ids = z.array(z.uuid()).min(1).max(100).safeParse(formData.getAll("questionId"));
  if (!examId.success || !ids.success) return;
  const supabase = await createClient();
  const [{ data: qs }, { data: last }] = await Promise.all([
    supabase.from("questions").select("id, marks").in("id", ids.data),
    supabase.from("exam_questions").select("position").eq("exam_id", examId.data).order("position", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let pos = last?.position ?? 0;
  const order = new Map(ids.data.map((id, i) => [id, i]));
  const rows = (qs ?? []).sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((q) => ({ school_id: school.schoolId, exam_id: examId.data, question_id: q.id, position: ++pos, marks: q.marks }));
  const { error } = await supabase.from("exam_questions").upsert(rows, { onConflict: "exam_id,question_id", ignoreDuplicates: true });
  revalidatePath(`/school/exams/${examId.data}`);
  if (error) redirect(`/school/exams/${examId.data}?error=${encodeURIComponent(dbMessage(error.message))}`);
}

export async function removeExamQuestion(formData: FormData) {
  await requireTeacher();
  const input = z.object({ id: z.uuid(), examId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("exam_questions").delete().eq("id", input.data.id);
  revalidatePath(`/school/exams/${input.data.examId}`);
  if (error) redirect(`/school/exams/${input.data.examId}?error=${encodeURIComponent(dbMessage(error.message))}`);
}

export async function markAnswer(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireTeacher();
  const input = z.object({ answerId: z.uuid(), path: z.string().startsWith("/school/exams/"), marks: z.coerce.number().min(0), feedback: z.string().trim().max(2000).optional() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: "Enter the marks awarded." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_exam_answer", { p_answer: input.data.answerId, p_marks: input.data.marks, p_feedback: input.data.feedback ?? null });
  if (error) return { ok: false, message: /between/.test(error.message) ? error.message.replace(/^marks/, "Marks") : dbMessage(error.message) };
  revalidatePath(input.data.path);
  return { ok: true, message: "Saved." };
}

export async function recordInResults(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireTeacher();
  const input = z.object({ examId: z.uuid(), weight: z.coerce.number().positive("Enter a weight").max(100) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return fieldErrors(input.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_exam_in_results", { p_exam: input.data.examId, p_weight: input.data.weight });
  if (error) return { ok: false, message: dbMessage(error.message) };
  redirect(`/school/assessments/${data}`);
}
