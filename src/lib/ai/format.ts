/**
 * Converts structured AI drafts into the app's own formats. Pure functions (unit-tested).
 */
export type LessonPlan = { title: string; objectives: string[]; materials: string[]; introduction: string; activities: { step: string; minutes: number; teacher: string; students: string }[]; assessment: string[]; differentiation: string; homework: string; notes_on_sources: string };
export type Notes = { title: string; summary: string; sections: { heading: string; body: string }[]; key_terms: { term: string; definition: string }[]; exercises: string[] };
export type GeneratedQuestion = { type: "mcq" | "true_false" | "short_answer" | "essay"; prompt: string; options: string[]; correct_option: number | null; correct_bool: boolean | null; accepted_answers: string[]; marking_guide: string; marks: number; difficulty: "easy" | "medium" | "hard"; topic: string };

const list = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

export function lessonPlanToText(p: LessonPlan) {
  return [
    `LEARNING OBJECTIVES\n${list(p.objectives)}`,
    `MATERIALS\n${list(p.materials)}`,
    `INTRODUCTION\n${p.introduction}`,
    `ACTIVITIES\n${p.activities.map((a, i) => `${i + 1}. ${a.step} (${a.minutes} min)\n   Teacher: ${a.teacher}\n   Students: ${a.students}`).join("\n")}`,
    `ASSESSMENT\n${list(p.assessment)}`,
    `DIFFERENTIATION\n${p.differentiation}`,
    `HOMEWORK\n${p.homework}`,
  ].join("\n\n");
}

export function notesToText(n: Notes) {
  return [
    n.summary,
    ...n.sections.map((s) => `${s.heading.toUpperCase()}\n${s.body}`),
    n.key_terms.length ? `KEY TERMS\n${n.key_terms.map((k) => `• ${k.term}: ${k.definition}`).join("\n")}` : "",
    n.exercises.length ? `EXERCISES\n${n.exercises.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

const LETTERS = ["a", "b", "c", "d", "e", "f"];

/**
 * Validates an AI-generated question and maps it to a question-bank row (source: ai_generated).
 * Returns null for anything malformed, so nothing broken reaches the bank.
 */
export function toQuestionRow(q: GeneratedQuestion, subjectId: string, formLevel: number | null) {
  const prompt = q.prompt?.trim();
  if (!prompt || prompt.length < 3 || prompt.length > 5000) return null;
  const marks = Math.min(Math.max(Number(q.marks) || 1, 0.5), 100);
  const base = { subject_id: subjectId, type: q.type, prompt, marks, difficulty: q.difficulty ?? "medium", topic: q.topic?.slice(0, 120) || null, form_level: formLevel, source: "ai_generated", source_note: "Generated with AI and reviewed by a teacher" };
  if (q.type === "mcq") {
    const options = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    if (options.length < 2 || q.correct_option == null || q.correct_option < 0 || q.correct_option >= options.length) return null;
    return { ...base, options: options.map((text, i) => ({ id: LETTERS[i], text: text.slice(0, 500) })), answer: { correct: LETTERS[q.correct_option] } };
  }
  if (q.type === "true_false") return typeof q.correct_bool === "boolean" ? { ...base, options: null, answer: { correct: q.correct_bool } } : null;
  if (q.type === "short_answer") {
    const accepted = (q.accepted_answers ?? []).map((a) => String(a).trim()).filter(Boolean).slice(0, 10);
    return accepted.length ? { ...base, options: null, answer: { accepted } } : null;
  }
  if (q.type === "essay") return { ...base, options: null, answer: q.marking_guide?.trim() ? { guide: q.marking_guide.trim().slice(0, 2000) } : {} };
  return null;
}

/** Replaces student names with S1, S2… before class data is sent to the AI. */
export function pseudonymise<T extends { name: string; student_id?: string }>(students: T[]) {
  return students.map((s, i) => {
    const { name: _n, student_id: _id, ...rest } = s;
    return { id: `S${i + 1}`, ...rest };
  });
}
