"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { uploadClassroomFile } from "@/lib/storage";
import { requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

const studentMessage = (m: string) =>
  /deadline has passed|already been marked|Write an answer|not opened yet|has closed|no questions yet|Time is up|has been submitted/.test(m) ? m.replace(/^[a-z]/, (c) => c.toUpperCase()) : "Something went wrong. Please try again.";

export async function submitWork(_prev: FormState, formData: FormData): Promise<FormState> {
  const { student, school } = await requireEnrolledStudent();
  const input = z.object({ assignmentId: z.uuid(), body: z.string().max(20000).optional() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: "Your answer is too long." };
  const supabase = await createClient();
  const upload = await uploadClassroomFile(supabase, `${school.schoolId}/submissions/${input.data.assignmentId}/${student.id}`, formData.get("file"));
  if (upload.error) return { ok: false, errors: { file: [upload.error] } };
  const { error } = await supabase.rpc("submit_assignment", { p_assignment: input.data.assignmentId, p_body: input.data.body ?? "", p_file_path: upload.path ?? null });
  if (error) {
    if (upload.path) await supabase.storage.from("classroom").remove([upload.path]);
    return { ok: false, message: studentMessage(error.message) };
  }
  revalidatePath(`/student/assignments/${input.data.assignmentId}`);
  revalidatePath("/student", "layout");
  return { ok: true, message: "Submitted. You can update your work until your teacher marks it." };
}

export async function startExam(formData: FormData) {
  await requireEnrolledStudent();
  const examId = z.uuid().safeParse(formData.get("examId"));
  if (!examId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_exam", { p_exam: examId.data });
  if (error) redirect(`/student/exams/${examId.data}?error=${encodeURIComponent(studentMessage(error.message))}`);
  redirect(`/student/exams/${examId.data}?take=1`);
}

/** Autosave of one answer. Returns an error string for the exam client to show. */
export async function saveAnswer(attemptId: string, examQuestionId: string, response: unknown): Promise<{ ok: boolean; error?: string; closed?: boolean }> {
  await requireEnrolledStudent();
  const ids = z.object({ a: z.uuid(), q: z.uuid() }).safeParse({ a: attemptId, q: examQuestionId });
  const body = z.union([z.object({ choice: z.string().max(4) }), z.object({ value: z.boolean() }), z.object({ text: z.string().max(10000) })]).safeParse(response);
  if (!ids.success || !body.success) return { ok: false, error: "Invalid answer." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_exam_answer", { p_attempt: ids.data.a, p_exam_question: ids.data.q, p_response: body.data });
  if (error) return { ok: false, error: studentMessage(error.message), closed: /Time is up|has been submitted/.test(error.message) };
  return { ok: true };
}

export async function submitExam(formData: FormData) {
  await requireEnrolledStudent();
  const input = z.object({ attemptId: z.uuid(), examId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  await supabase.rpc("submit_exam", { p_attempt: input.data.attemptId });
  revalidatePath("/student", "layout");
  redirect(`/student/exams/${input.data.examId}?submitted=1`);
}
