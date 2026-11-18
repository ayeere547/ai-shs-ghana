"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { pseudonymise, toQuestionRow, type GeneratedQuestion, type LessonPlan, type Notes } from "@/lib/ai/format";
import {
  COMMENT_SCHEMA, insightsPrompt, INSIGHTS_SCHEMA, LESSON_PLAN_SCHEMA, lessonPlanPrompt, MARKING_SCHEMA, markingPrompt, NOTES_SCHEMA, notesPrompt,
  PROMPT_VERSIONS, QUESTIONS_SCHEMA, questionsPrompt, reportCommentPrompt, type Source,
} from "@/lib/ai/prompts";
import { aiAccess, aiErrorMessage, generateStructured, retrieve } from "@/lib/ai/service";
import { requireSchool } from "@/lib/auth/session";
import { computeResults, type Band } from "@/lib/results/compute";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

async function requireAiTeacher() {
  const ctx = await requireSchool();
  if (ctx.school.schoolStatus !== "active" || !ctx.school.permissions.has("ai.teacher_tools")) redirect("/school?denied=1");
  return ctx;
}

export type AiState<T> = FormState & { draftId?: string; data?: T; sources?: Pick<Source, "n" | "title" | "official">[] };
const brief = (s: Source[]) => s.map(({ n, title, official }) => ({ n, title, official }));

const topicSchema = z.object({
  subjectId: z.uuid("Choose a subject"),
  topic: z.string().trim().min(2, "Enter a topic").max(200),
  formLevel: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(6).nullable()),
});

async function subjectName(subjectId: string, schoolId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("school_subjects").select("name").eq("id", subjectId).eq("school_id", schoolId).maybeSingle();
  return data?.name ?? null;
}

async function saveDraft(schoolId: string, kind: string, title: string, input: unknown, output: unknown) {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_drafts").insert({ school_id: schoolId, kind, title: title.slice(0, 200), input, output }).select("id").single();
  return data?.id as string | undefined;
}

/* ------------------------------ lesson plans ------------------------------ */

export async function generateLessonPlan(_prev: AiState<LessonPlan>, formData: FormData): Promise<AiState<LessonPlan>> {
  const { session, school } = await requireAiTeacher();
  const parsed = topicSchema.extend({ minutes: z.coerce.number().int().min(20).max(180), focus: z.string().trim().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const access = await aiAccess(school.schoolId, "teacher");
  if (!access.ok) return { ok: false, message: access.reason };
  const subject = await subjectName(v.subjectId, school.schoolId);
  if (!subject) return { ok: false, message: "Choose a subject." };
  const ctx = { schoolId: school.schoolId, userId: session.userId };
  try {
    const sources = await retrieve(ctx, `${v.topic} ${subject}`, subject, 6);
    const { data } = await generateStructured<LessonPlan>({
      ctx, feature: "lesson_plan", promptVersion: PROMPT_VERSIONS.lesson_plan, sources,
      prompt: lessonPlanPrompt({ subject, topic: v.topic, formLevel: v.formLevel, minutes: v.minutes, focus: v.focus || null }),
      schema: { name: "lesson_plan", schema: LESSON_PLAN_SCHEMA as unknown as Record<string, unknown> },
    });
    const draftId = await saveDraft(school.schoolId, "lesson_plan", data.title, { ...v, subject }, data);
    return { ok: true, data, draftId, sources: brief(sources) };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/* --------------------------------- notes ---------------------------------- */

export async function generateNotes(_prev: AiState<Notes>, formData: FormData): Promise<AiState<Notes>> {
  const { session, school } = await requireAiTeacher();
  const parsed = topicSchema.extend({ style: z.enum(["full", "revision", "simplified"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const access = await aiAccess(school.schoolId, "teacher");
  if (!access.ok) return { ok: false, message: access.reason };
  const subject = await subjectName(v.subjectId, school.schoolId);
  if (!subject) return { ok: false, message: "Choose a subject." };
  const ctx = { schoolId: school.schoolId, userId: session.userId };
  try {
    const sources = await retrieve(ctx, `${v.topic} ${subject}`, subject, 6);
    const { data } = await generateStructured<Notes>({
      ctx, feature: "notes", promptVersion: PROMPT_VERSIONS.notes, sources, maxTokens: 3000,
      prompt: notesPrompt({ subject, topic: v.topic, formLevel: v.formLevel, style: v.style }),
      schema: { name: "notes", schema: NOTES_SCHEMA as unknown as Record<string, unknown> },
    });
    const draftId = await saveDraft(school.schoolId, "notes", data.title, { ...v, subject }, data);
    return { ok: true, data, draftId, sources: brief(sources) };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/** Saves a reviewed lesson plan or notes draft into a classroom as an UNPUBLISHED material. */
export async function draftToMaterial(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireAiTeacher();
  const input = z.object({ draftId: z.uuid(), pair: z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, "Choose a class"), title: z.string().trim().min(2).max(160), body: z.string().trim().min(1).max(50000) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };
  const [classId, subjectId] = input.data.pair.split(":");
  const supabase = await createClient();
  const { error } = await supabase.from("learning_materials").insert({ school_id: school.schoolId, class_id: classId, subject_id: subjectId, title: input.data.title, kind: "note", body: input.data.body, is_published: false, description: "Drafted with AI — review before publishing" });
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only add materials for classes you teach." : "Couldn't save the material." };
  await supabase.from("ai_drafts").update({ status: "used" }).eq("id", input.data.draftId);
  revalidatePath("/school/classroom");
  return { ok: true, message: "Saved to the classroom as an unpublished draft. Review it there, then publish." };
}

/* -------------------------------- questions ------------------------------- */

export async function generateQuestions(_prev: AiState<{ questions: GeneratedQuestion[] }>, formData: FormData): Promise<AiState<{ questions: GeneratedQuestion[] }>> {
  const { session, school } = await requireAiTeacher();
  const parsed = topicSchema
    .extend({ count: z.coerce.number().int().min(1).max(20), difficulty: z.enum(["easy", "medium", "hard", "mixed"]), marks: z.coerce.number().min(0.5).max(20), types: z.array(z.enum(["mcq", "true_false", "short_answer", "essay"])).min(1, "Choose at least one question type") })
    .safeParse({ ...Object.fromEntries(formData), types: formData.getAll("types") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const access = await aiAccess(school.schoolId, "teacher");
  if (!access.ok) return { ok: false, message: access.reason };
  const subject = await subjectName(v.subjectId, school.schoolId);
  if (!subject) return { ok: false, message: "Choose a subject." };
  const ctx = { schoolId: school.schoolId, userId: session.userId };
  try {
    const sources = await retrieve(ctx, `${v.topic} ${subject}`, subject, 5);
    const { data } = await generateStructured<{ questions: GeneratedQuestion[] }>({
      ctx, feature: "questions", promptVersion: PROMPT_VERSIONS.questions, sources, maxTokens: 3500,
      prompt: questionsPrompt({ subject, topic: v.topic, formLevel: v.formLevel, count: v.count, types: v.types, difficulty: v.difficulty, marks: v.marks }),
      schema: { name: "questions", schema: QUESTIONS_SCHEMA as unknown as Record<string, unknown> },
    });
    const draftId = await saveDraft(school.schoolId, "questions", `${subject}: ${v.topic}`, { ...v, subject }, data);
    return { ok: true, data, draftId, sources: brief(sources) };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/** Adds the teacher-selected generated questions to the bank, labelled AI-generated. */
export async function addGeneratedQuestions(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireAiTeacher();
  const draftId = z.uuid().safeParse(formData.get("draftId"));
  const picked = z.array(z.coerce.number().int().min(0).max(50)).min(1, "Select at least one question").safeParse(formData.getAll("pick"));
  if (!draftId.success) return { ok: false, message: "Draft not found." };
  if (!picked.success) return { ok: false, message: "Select at least one question." };
  const supabase = await createClient();
  const { data: draft } = await supabase.from("ai_drafts").select("input, output").eq("id", draftId.data).eq("kind", "questions").maybeSingle();
  if (!draft) return { ok: false, message: "Draft not found." };
  const input = draft.input as { subjectId: string; formLevel: number | null };
  const questions = (draft.output as { questions: GeneratedQuestion[] }).questions ?? [];
  const rows = picked.data.map((i) => questions[i] && toQuestionRow(questions[i], input.subjectId, input.formLevel)).filter(Boolean).map((r) => ({ ...r!, school_id: school.schoolId }));
  if (!rows.length) return { ok: false, message: "The selected questions weren't valid. Generate again." };
  const { error } = await supabase.from("questions").insert(rows);
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only add questions for subjects you teach." : "Couldn't add the questions." };
  await supabase.from("ai_drafts").update({ status: "used" }).eq("id", draftId.data);
  revalidatePath("/school/questions");
  return { ok: true, message: `${rows.length} question${rows.length === 1 ? "" : "s"} added to the bank, labelled “AI-generated practice question”.` };
}

/* ------------------------------ marking assistant ------------------------- */

export type MarkSuggestion = { suggested_marks: number; rationale: string; feedback_for_student: string };

/** Suggests a mark for an essay answer or an assignment submission. Never saves a mark. */
export async function suggestMark(_prev: AiState<MarkSuggestion>, formData: FormData): Promise<AiState<MarkSuggestion>> {
  const { session, school } = await requireAiTeacher();
  const input = z.object({ kind: z.enum(["exam_answer", "submission"]), id: z.uuid(), rubric: z.string().trim().max(3000).optional() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: "Invalid request." };
  const access = await aiAccess(school.schoolId, "teacher");
  if (!access.ok) return { ok: false, message: access.reason };
  const supabase = await createClient();
  let question = "";
  let guide: string | null = null;
  let answer = "";
  let max = 0;
  if (input.data.kind === "exam_answer") {
    // RLS: only the exam's teacher can read the answer and its question.
    const { data } = await supabase.from("exam_answers").select("response, exam_questions(marks, questions(prompt, answer))").eq("id", input.data.id).maybeSingle<{ response: { text?: string } | null; exam_questions: { marks: number; questions: { prompt: string; answer: { guide?: string } } } }>();
    if (!data) return { ok: false, message: "Answer not found." };
    question = data.exam_questions.questions.prompt;
    guide = data.exam_questions.questions.answer?.guide ?? null;
    answer = data.response?.text ?? "";
    max = Number(data.exam_questions.marks);
  } else {
    const { data } = await supabase.from("assignment_submissions").select("body, assignments(instructions, max_score)").eq("id", input.data.id).maybeSingle<{ body: string | null; assignments: { instructions: string; max_score: number } }>();
    if (!data) return { ok: false, message: "Submission not found." };
    question = data.assignments.instructions;
    answer = data.body ?? "";
    max = Number(data.assignments.max_score);
  }
  if (!answer.trim()) return { ok: false, message: "There's no written answer to assess (files aren't read by the assistant)." };
  try {
    const { data } = await generateStructured<MarkSuggestion>({
      ctx: { schoolId: school.schoolId, userId: session.userId }, feature: "marking", promptVersion: PROMPT_VERSIONS.marking, maxTokens: 700,
      prompt: markingPrompt({ question, guide, rubric: input.data.rubric || null, answer: answer.slice(0, 8000), maxMarks: max }),
      schema: { name: "marking", schema: MARKING_SCHEMA as unknown as Record<string, unknown> },
    });
    data.suggested_marks = Math.min(Math.max(Math.round(Number(data.suggested_marks) * 2) / 2, 0), max);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/* ------------------------------ report comments --------------------------- */

export async function draftReportComment(_prev: AiState<{ comment: string }>, formData: FormData): Promise<AiState<{ comment: string }>> {
  const { session, school } = await requireAiTeacher();
  const input = z.object({ studentId: z.uuid(), termId: z.uuid(), tone: z.enum(["encouraging", "balanced", "formal"]).default("encouraging"), notes: z.string().trim().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: "Invalid request." };
  const access = await aiAccess(school.schoolId, "teacher");
  if (!access.ok) return { ok: false, message: access.reason };
  const supabase = await createClient();
  const { data: st } = await supabase.from("students").select("id, class_id").eq("id", input.data.studentId).eq("school_id", school.schoolId).maybeSingle();
  if (!st?.class_id) return { ok: false, message: "Student not found." };
  const [{ data: assessments }, { data: scheme }, { data: term }] = await Promise.all([
    supabase.from("assessments").select("id, subject_id, max_score, weight, school_subjects(name)").eq("term_id", input.data.termId).eq("class_id", st.class_id).returns<{ id: string; subject_id: string; max_score: number; weight: number; school_subjects: { name: string } }[]>(),
    supabase.from("grading_schemes").select("grading_bands(grade, min_score, max_score, remark)").eq("school_id", school.schoolId).eq("is_default", true).maybeSingle<{ grading_bands: Band[] }>(),
    supabase.from("academic_terms").select("starts_on, ends_on").eq("id", input.data.termId).single(),
  ]);
  const ids = (assessments ?? []).map((a) => a.id);
  const [{ data: scores }, { data: att }] = await Promise.all([
    ids.length ? supabase.from("assessment_scores").select("assessment_id, student_id, score").eq("student_id", st.id).in("assessment_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("attendance").select("status").eq("student_id", st.id).gte("attendance_date", term?.starts_on ?? "1900-01-01").lte("attendance_date", term?.ends_on ?? "2999-01-01"),
  ]);
  const [r] = computeResults({ studentIds: [st.id], assessments: (assessments ?? []).map((a) => ({ ...a, max_score: Number(a.max_score), weight: Number(a.weight) })), scores: scores ?? [], bands: scheme?.grading_bands ?? [] });
  const names = new Map((assessments ?? []).map((a) => [a.subject_id, a.school_subjects.name]));
  const attendanceRate = att?.length ? Math.round((att.filter((a) => a.status === "present" || a.status === "late").length / att.length) * 100) : null;
  try {
    const { data } = await generateStructured<{ comment: string }>({
      ctx: { schoolId: school.schoolId, userId: session.userId }, feature: "report_comment", promptVersion: PROMPT_VERSIONS.report_comment, maxTokens: 300,
      prompt: reportCommentPrompt({ average: r?.average ?? null, subjects: Object.entries(r?.subjects ?? {}).map(([id, x]) => ({ subject: names.get(id) ?? "Subject", total: x.total })), attendanceRate, teacherNotes: input.data.notes || null, tone: input.data.tone }),
      schema: { name: "comment", schema: COMMENT_SCHEMA as unknown as Record<string, unknown> },
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/** Saves a report comment as a draft or approves it. Approval is the human review step. */
export async function saveReportComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchool();
  const input = z.object({ studentId: z.uuid(), termId: z.uuid(), comment: z.string().trim().min(3, "Write a comment").max(1500), approve: z.enum(["0", "1"]), aiAssisted: z.enum(["0", "1"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("report_comments").upsert(
    { school_id: school.schoolId, student_id: input.data.studentId, term_id: input.data.termId, author_id: user!.id, comment: input.data.comment, status: input.data.approve === "1" ? "approved" : "draft", ai_assisted: input.data.aiAssisted === "1" },
    { onConflict: "student_id,term_id,author_id" },
  );
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only comment on students you teach." : "Couldn't save the comment." };
  revalidatePath("/school/report-comments");
  return { ok: true, message: input.data.approve === "1" ? "Approved. Families see it once term results are published." : "Draft saved." };
}

/* -------------------------------- insights -------------------------------- */

export type InsightSummary = { summary: string; priorities: string[]; suggested_actions: string[] };

/** Summarises a class's (anonymised) learning indicators. Names never leave the platform. */
export async function summariseInsights(_prev: AiState<InsightSummary>, formData: FormData): Promise<AiState<InsightSummary>> {
  const { session, school } = await requireAiTeacher();
  const input = z.object({ classId: z.uuid(), termId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: "Invalid request." };
  const access = await aiAccess(school.schoolId, "teacher");
  if (!access.ok) return { ok: false, message: access.reason };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("class_insights", { p_class: input.data.classId, p_term: input.data.termId });
  if (error || !data) return { ok: false, message: "You can't view insights for this class." };
  const d = data as { students: { name: string; student_id: string }[]; subjects: unknown; topics: unknown; class_attendance_rate: number | null };
  try {
    const { data: summary } = await generateStructured<InsightSummary>({
      ctx: { schoolId: school.schoolId, userId: session.userId }, feature: "insights", promptVersion: PROMPT_VERSIONS.insights, maxTokens: 900,
      prompt: insightsPrompt({ students: pseudonymise(d.students), subjects: d.subjects, topics: d.topics, class_attendance_rate: d.class_attendance_rate }),
      schema: { name: "insights", schema: INSIGHTS_SCHEMA as unknown as Record<string, unknown> },
    });
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, message: aiErrorMessage(e) };
  }
}
