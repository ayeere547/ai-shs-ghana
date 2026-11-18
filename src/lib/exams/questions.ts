import { z } from "zod";

export const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice" },
  { value: "true_false", label: "True / false" },
  { value: "short_answer", label: "Short answer (auto-marked)" },
  { value: "essay", label: "Essay / structured (teacher-marked)" },
] as const;

export const QUESTION_SOURCES = [
  { value: "teacher", label: "Written by a teacher" },
  { value: "ai_generated", label: "AI-generated (reviewed by a teacher)" },
  { value: "licensed_past_question", label: "Licensed official past question" },
] as const;

export const EXAM_KINDS = [
  { value: "class_test", label: "Class test" },
  { value: "mid_term", label: "Mid-term exam" },
  { value: "end_of_term", label: "End-of-term exam" },
  { value: "mock", label: "Mock exam" },
  { value: "wassce_practice", label: "WASSCE practice" },
] as const;

export const sourceLabel = (s: string) =>
  s === "licensed_past_question" ? "Licensed past question" : s === "ai_generated" ? "AI-generated practice question" : "Teacher question";

const base = z.object({
  subjectId: z.uuid("Choose a subject"),
  type: z.enum(["mcq", "true_false", "short_answer", "essay"]),
  prompt: z.string().trim().min(3, "Write the question").max(5000),
  marks: z.coerce.number().positive("Marks must be above 0").max(100),
  topic: z.string().trim().max(120).optional().transform((v) => v || null),
  formLevel: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(6).nullable()),
  difficulty: z.enum(["easy", "medium", "hard"]),
  source: z.enum(["teacher", "ai_generated", "licensed_past_question"]),
  sourceNote: z.string().trim().max(300).optional().transform((v) => v || null),
});

const OPTION_IDS = ["a", "b", "c", "d", "e", "f"];

/**
 * Turns the question form into the database shape. Options are lettered a–f in the order given,
 * blank options are dropped, and the answer key is validated against them.
 */
export function parseQuestionForm(formData: FormData):
  | { ok: true; row: { subject_id: string; type: string; prompt: string; options: { id: string; text: string }[] | null; answer: Record<string, unknown>; marks: number; topic: string | null; form_level: number | null; difficulty: string; source: string; source_note: string | null } }
  | { ok: false; errors: Record<string, string[]> } {
  const parsed = base.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  const v = parsed.data;
  const errors: Record<string, string[]> = {};
  if (v.source === "licensed_past_question" && !v.sourceNote) errors.sourceNote = ["Say which licensed paper this comes from"];

  let options: { id: string; text: string }[] | null = null;
  let answer: Record<string, unknown> = {};
  if (v.type === "mcq") {
    const texts = OPTION_IDS.map((id) => ({ id, text: String(formData.get(`option_${id}`) ?? "").trim() })).filter((o) => o.text);
    if (texts.length < 2) errors.options = ["Give at least two options"];
    if (texts.some((o) => o.text.length > 500)) errors.options = ["Keep each option under 500 characters"];
    options = texts.map((o, i) => ({ id: OPTION_IDS[i], text: o.text }));
    const chosen = String(formData.get("correct") ?? "");
    const index = texts.findIndex((o) => o.id === chosen);
    if (index < 0) errors.correct = ["Choose the correct option"];
    else answer = { correct: OPTION_IDS[index] };
  } else if (v.type === "true_false") {
    const c = formData.get("correctBool");
    if (c !== "true" && c !== "false") errors.correct = ["Choose true or false"];
    else answer = { correct: c === "true" };
  } else if (v.type === "short_answer") {
    const accepted = String(formData.get("accepted") ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (!accepted.length) errors.accepted = ["List at least one accepted answer"];
    answer = { accepted };
  } else {
    const guide = String(formData.get("guide") ?? "").trim().slice(0, 2000);
    answer = guide ? { guide } : {};
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    row: { subject_id: v.subjectId, type: v.type, prompt: v.prompt, options, answer, marks: v.marks, topic: v.topic, form_level: v.formLevel, difficulty: v.difficulty, source: v.source, source_note: v.sourceNote },
  };
}

/** Lifecycle label for an exam, shared by teacher and student views. */
export function examState(e: { is_published: boolean; opens_at: string; closes_at: string; results_released: boolean }, now = Date.now()) {
  if (!e.is_published) return { label: "Draft", tone: "neutral" as const };
  if (e.results_released) return { label: "Results released", tone: "success" as const };
  if (now < Date.parse(e.opens_at)) return { label: "Scheduled", tone: "info" as const };
  if (now <= Date.parse(e.closes_at)) return { label: "Open now", tone: "warning" as const };
  return { label: "Closed", tone: "neutral" as const };
}
