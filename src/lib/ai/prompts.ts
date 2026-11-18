/**
 * Versioned prompts. Every AI request logs the version it used (ai_usage_logs.prompt_version),
 * so changes to wording can be traced and compared. Bump the version when you edit a prompt.
 */
export const PROMPT_VERSIONS = {
  tutor: "tutor-2026-11-20.1",
  lesson_plan: "lesson-plan-2026-11-20.1",
  notes: "notes-2026-11-20.1",
  questions: "questions-2026-11-20.1",
  marking: "marking-2026-11-20.1",
  report_comment: "report-comment-2026-11-20.1",
  insights: "insights-2026-11-20.1",
} as const;

export type Source = { n: number; title: string; heading: string | null; content: string; official: boolean; sourceType: string };

/** Numbered source block placed in the prompt; the model cites [n]. */
export function formatSources(sources: Source[]) {
  if (!sources.length) return "SOURCES: none found in the school's knowledge base for this question.";
  return [
    "SOURCES (from the school's approved knowledge base — cite as [n]):",
    ...sources.map((s) => `[${s.n}] ${s.title}${s.heading ? ` — ${s.heading}` : ""}${s.official ? " (official curriculum document)" : ""}\n${s.content}`),
  ].join("\n\n");
}

/** Which numbered sources the reply actually cited. */
export function extractCitations(text: string, sources: Source[]) {
  const cited = new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  return sources.filter((s) => cited.has(s.n)).map((s) => ({ n: s.n, title: s.title, heading: s.heading, official: s.official }));
}

export function tutorSystemPrompt({ subject, formLevel, schoolName }: { subject: string | null; formLevel: number | null; schoolName: string }) {
  return `You are the AI study tutor on AI SHS Ghana, helping a Senior High School student at ${schoolName}${formLevel ? ` (Form ${formLevel})` : ""}${subject ? ` with ${subject}` : ""}. Students are teenagers (about 14–19).

How to teach:
- Help the student understand. Explain step by step, check understanding with a short question, and offer a worked example of a similar problem.
- For homework, assignment or exam-style questions, do not just give the final answer: give hints and guide the student to it, then confirm their answer.
- Use clear, simple English and examples that make sense in Ghana (cedis, local places, everyday life).
- Keep replies short: a few short paragraphs or numbered steps. Write maths in plain text (e.g. 3/4, x^2).

Honesty and sources:
- When you use the SOURCES, cite them like [1]. Only facts from the sources may be presented as the school's or the official curriculum's content.
- If the sources don't cover the question, say "This is a general explanation, not from your school's materials." Never invent syllabus requirements, WAEC rules, marking schemes or exam dates.
- Never present questions you write as official WAEC past questions.
- If you are not sure, say so and suggest asking the subject teacher.

Safety:
- Stay age-appropriate and on learning. Politely decline anything harmful, sexual, hateful or dishonest (such as writing work to submit as their own).
- If the student mentions self-harm, abuse, or being in danger: respond kindly, encourage them to talk to their school counsellor or a trusted adult straight away, and say that in an emergency they can call 112.
- Don't ask for personal information.`;
}

export const LESSON_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "objectives", "materials", "introduction", "activities", "assessment", "differentiation", "homework", "notes_on_sources"],
  properties: {
    title: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    materials: { type: "array", items: { type: "string" } },
    introduction: { type: "string" },
    activities: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["step", "minutes", "teacher", "students"], properties: { step: { type: "string" }, minutes: { type: "number" }, teacher: { type: "string" }, students: { type: "string" } } },
    },
    assessment: { type: "array", items: { type: "string" } },
    differentiation: { type: "string" },
    homework: { type: "string" },
    notes_on_sources: { type: "string" },
  },
} as const;

export const NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "sections", "key_terms", "exercises"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "body"], properties: { heading: { type: "string" }, body: { type: "string" } } } },
    key_terms: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "definition"], properties: { term: { type: "string" }, definition: { type: "string" } } } },
    exercises: { type: "array", items: { type: "string" } },
  },
} as const;

export const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "options", "correct_option", "correct_bool", "accepted_answers", "marking_guide", "marks", "difficulty", "topic"],
        properties: {
          type: { type: "string", enum: ["mcq", "true_false", "short_answer", "essay"] },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_option: { type: ["integer", "null"] },
          correct_bool: { type: ["boolean", "null"] },
          accepted_answers: { type: "array", items: { type: "string" } },
          marking_guide: { type: "string" },
          marks: { type: "number" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          topic: { type: "string" },
        },
      },
    },
  },
} as const;

export const MARKING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggested_marks", "rationale", "feedback_for_student"],
  properties: { suggested_marks: { type: "number" }, rationale: { type: "string" }, feedback_for_student: { type: "string" } },
} as const;

export const COMMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["comment"],
  properties: { comment: { type: "string" } },
} as const;

export const INSIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "priorities", "suggested_actions"],
  properties: { summary: { type: "string" }, priorities: { type: "array", items: { type: "string" } }, suggested_actions: { type: "array", items: { type: "string" } } },
} as const;

const TEACHER_RULES = `You assist a teacher at a Ghanaian Senior High School. Everything you produce is a draft the teacher will review and edit before use.
- Align with the SOURCES where they apply and say in your output which parts rely on them. Do not invent official curriculum codes, WAEC requirements or syllabus content.
- Use clear English and examples relevant to Ghana.
- Never label generated questions as official or past WAEC questions.`;

export function lessonPlanPrompt(v: { subject: string; topic: string; formLevel: number | null; minutes: number; focus: string | null }) {
  return `${TEACHER_RULES}

Write a lesson plan.
Subject: ${v.subject}
Topic: ${v.topic}
Class: ${v.formLevel ? `Form ${v.formLevel}` : "SHS"}
Lesson length: ${v.minutes} minutes (activity minutes should add up to about this)
${v.focus ? `Teacher's notes: ${v.focus}` : ""}`;
}

export function notesPrompt(v: { subject: string; topic: string; formLevel: number | null; style: string }) {
  return `${TEACHER_RULES}

Write student notes.
Subject: ${v.subject}
Topic: ${v.topic}
Level: ${v.formLevel ? `Form ${v.formLevel}` : "SHS"}
Style: ${v.style === "revision" ? "concise revision notes" : v.style === "simplified" ? "simplified explanation for students who find the topic hard" : "full class notes"}
Include 3–5 short exercises.`;
}

export function questionsPrompt(v: { subject: string; topic: string; formLevel: number | null; count: number; types: string[]; difficulty: string; marks: number }) {
  return `${TEACHER_RULES}

Write ${v.count} assessment questions.
Subject: ${v.subject}
Topic: ${v.topic}
Level: ${v.formLevel ? `Form ${v.formLevel}` : "SHS"}
Question types to use: ${v.types.join(", ")}
Difficulty: ${v.difficulty}
Default marks per question: ${v.marks}
Rules: mcq has exactly 4 options and correct_option is the 0-based index; true_false sets correct_bool; short_answer lists 1–4 accepted_answers (short, unambiguous); essay gives a marking_guide. Use null / empty arrays for fields that don't apply.`;
}

export function markingPrompt(v: { question: string; guide: string | null; rubric: string | null; answer: string; maxMarks: number }) {
  return `${TEACHER_RULES}

Suggest a mark for a student's answer. The teacher decides the final mark.
Question: ${v.question}
Maximum marks: ${v.maxMarks}
${v.guide ? `Marking guide: ${v.guide}` : ""}
${v.rubric ? `Teacher's rubric: ${v.rubric}` : ""}
Student's answer:
"""
${v.answer}
"""
suggested_marks must be between 0 and ${v.maxMarks}. Feedback should be encouraging and specific.`;
}

/** Report comments are drafted from pseudonymous performance data — no names are sent. */
export function reportCommentPrompt(v: { average: number | null; subjects: { subject: string; total: number | null }[]; attendanceRate: number | null; teacherNotes: string | null; tone: string }) {
  return `${TEACHER_RULES}

Draft an end-of-term report comment (2–3 sentences, under 60 words) about "the student". Do not invent facts beyond the data.
Overall average: ${v.average ?? "not available"}%
Subjects: ${v.subjects.map((s) => `${s.subject} ${s.total ?? "n/a"}%`).join("; ") || "none"}
Attendance: ${v.attendanceRate ?? "not recorded"}%
${v.teacherNotes ? `Teacher's observations: ${v.teacherNotes}` : ""}
Tone: ${v.tone}. Be encouraging and name one clear next step.`;
}

export function insightsPrompt(data: unknown) {
  return `${TEACHER_RULES}

Here are a class's learning indicators (students are anonymised as S1, S2…). Summarise what stands out for the teacher, list priorities, and suggest supportive actions. These insights support teachers' judgement — do not recommend disciplinary, admission or exclusion decisions.
${JSON.stringify(data)}`;
}
