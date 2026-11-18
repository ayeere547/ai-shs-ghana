"use client";

import { BookMarked, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";

import {
  addGeneratedQuestions, draftReportComment, draftToMaterial, generateLessonPlan, generateNotes, generateQuestions, saveReportComment, suggestMark, summariseInsights,
  type AiState, type InsightSummary, type MarkSuggestion,
} from "@/app/school/ai/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { lessonPlanToText, notesToText, type GeneratedQuestion, type LessonPlan, type Notes } from "@/lib/ai/format";
import type { FormState } from "@/lib/validation/auth";

type Opt = { value: string; label: string };

function Sources({ sources }: { sources?: { n: number; title: string; official: boolean }[] }) {
  if (!sources) return null;
  return (
    <div className="rounded-md border border-border bg-surface-muted/60 p-3 text-xs">
      <p className="mb-1 font-medium">Knowledge-base sources used</p>
      {sources.length ? (
        <ul className="space-y-0.5 text-muted-foreground">{sources.map((s) => <li key={s.n} className="flex items-center gap-1.5"><BookMarked className="h-3.5 w-3.5" /> [{s.n}] {s.title}{s.official && <Badge tone="success" className="ml-1">Official</Badge>}</li>)}</ul>
      ) : (
        <p className="text-muted-foreground">None found — this draft is general AI content. Check it carefully against your syllabus.</p>
      )}
    </div>
  );
}

function TopicFields({ subjects, children }: { subjects: Opt[]; children?: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Subject" htmlFor="ai-subject"><Select id="ai-subject" name="subjectId" defaultValue={subjects[0]?.value}>{subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
      <div className="sm:col-span-2"><Field label="Topic" htmlFor="ai-topic"><Input id="ai-topic" name="topic" placeholder="e.g. Adding and subtracting fractions" /></Field></div>
      <Field label="Form" htmlFor="ai-form"><Select id="ai-form" name="formLevel" defaultValue="1"><option value="">Any</option>{[1, 2, 3].map((n) => <option key={n} value={n}>Form {n}</option>)}</Select></Field>
      {children}
    </div>
  );
}

function SaveToClassroom({ draftId, title, body, pairs }: { draftId: string; title: string; body: string; pairs: Opt[] }) {
  const [state, action] = useActionState(draftToMaterial, {} as FormState);
  if (!pairs.length) return null;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end">
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="body" value={body} />
      <Field label="Save to a classroom (unpublished)" htmlFor={`pair-${draftId}`}><Select id={`pair-${draftId}`} name="pair" defaultValue={pairs[0].value}>{pairs.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
      <SubmitButton size="sm" variant="secondary">Save draft to classroom</SubmitButton>
      {state.message && <p className={state.ok ? "text-xs text-accent" : "text-xs text-danger"}>{state.message}</p>}
    </form>
  );
}

export function LessonPlanTool({ subjects, pairs }: { subjects: Opt[]; pairs: Opt[] }) {
  const [state, action] = useActionState(generateLessonPlan, {} as AiState<LessonPlan>);
  const [edited, setEdited] = useState<string | null>(null);
  const text = state.data ? lessonPlanToText(state.data) : "";
  return (
    <div className="space-y-4">
      <form action={(fd) => { setEdited(null); return action(fd); }} className="space-y-3">
        <TopicFields subjects={subjects}>
          <Field label="Lesson length (min)" htmlFor="ai-min"><Input id="ai-min" name="minutes" type="number" min={20} max={180} defaultValue={60} /></Field>
          <div className="sm:col-span-1"><Field label="Your notes (optional)" htmlFor="ai-focus"><Input id="ai-focus" name="focus" placeholder="e.g. many students struggle with…" /></Field></div>
        </TopicFields>
        <SubmitButton><Sparkles className="h-4 w-4" /> Draft lesson plan</SubmitButton>
      </form>
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state.data && state.draftId && (
        <div className="space-y-3">
          <h3 className="font-semibold">{state.data.title}</h3>
          <Textarea aria-label="Lesson plan (editable)" value={edited ?? text} onChange={(e) => setEdited(e.target.value)} className="min-h-96 font-mono text-xs" />
          {state.data.notes_on_sources && <p className="text-xs text-muted-foreground">{state.data.notes_on_sources}</p>}
          <Sources sources={state.sources} />
          <SaveToClassroom draftId={state.draftId} title={state.data.title} body={edited ?? text} pairs={pairs} />
        </div>
      )}
    </div>
  );
}

export function NotesTool({ subjects, pairs }: { subjects: Opt[]; pairs: Opt[] }) {
  const [state, action] = useActionState(generateNotes, {} as AiState<Notes>);
  const [edited, setEdited] = useState<string | null>(null);
  const text = state.data ? notesToText(state.data) : "";
  return (
    <div className="space-y-4">
      <form action={(fd) => { setEdited(null); return action(fd); }} className="space-y-3">
        <TopicFields subjects={subjects}>
          <Field label="Style" htmlFor="ai-style"><Select id="ai-style" name="style" defaultValue="full"><option value="full">Full class notes</option><option value="revision">Revision summary</option><option value="simplified">Simplified explanation</option></Select></Field>
        </TopicFields>
        <SubmitButton><Sparkles className="h-4 w-4" /> Draft notes</SubmitButton>
      </form>
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state.data && state.draftId && (
        <div className="space-y-3">
          <h3 className="font-semibold">{state.data.title}</h3>
          <Textarea aria-label="Notes (editable)" value={edited ?? text} onChange={(e) => setEdited(e.target.value)} className="min-h-96 text-sm" />
          <Sources sources={state.sources} />
          <SaveToClassroom draftId={state.draftId} title={state.data.title} body={edited ?? text} pairs={pairs} />
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { mcq: "Multiple choice", true_false: "True / false", short_answer: "Short answer", essay: "Essay" };

export function QuestionTool({ subjects }: { subjects: Opt[] }) {
  const [state, action] = useActionState(generateQuestions, {} as AiState<{ questions: GeneratedQuestion[] }>);
  const [added, addAction] = useActionState(addGeneratedQuestions, {} as FormState);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <TopicFields subjects={subjects}>
          <Field label="How many" htmlFor="ai-count"><Input id="ai-count" name="count" type="number" min={1} max={20} defaultValue={5} /></Field>
          <Field label="Difficulty" htmlFor="ai-diff"><Select id="ai-diff" name="difficulty" defaultValue="mixed"><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select></Field>
          <Field label="Marks each" htmlFor="ai-marks"><Input id="ai-marks" name="marks" type="number" min={0.5} max={20} step="0.5" defaultValue={2} /></Field>
        </TopicFields>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-sm font-medium">Question types</legend>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <label key={v} className="flex items-center gap-2"><input type="checkbox" name="types" value={v} defaultChecked={v !== "essay"} className="h-4 w-4 accent-[var(--royal)]" /> {l}</label>)}
        </fieldset>
        <SubmitButton><Sparkles className="h-4 w-4" /> Generate questions</SubmitButton>
      </form>
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state.data && state.draftId && (
        <form action={addAction} className="space-y-3">
          <input type="hidden" name="draftId" value={state.draftId} />
          <Alert tone="info">Review each question and its answer. Only the ones you tick are added — labelled as AI-generated practice questions, never as official past questions.</Alert>
          <ol className="space-y-3">
            {state.data.questions.map((q, i) => (
              <li key={i} className="rounded-md border border-border p-4 text-sm">
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="pick" value={i} defaultChecked className="mt-1 h-4 w-4 accent-[var(--royal)]" />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap gap-1.5"><Badge tone="info">{TYPE_LABEL[q.type]}</Badge><Badge>{q.marks} marks</Badge><Badge>{q.difficulty}</Badge></span>
                    <span className="block whitespace-pre-wrap">{q.prompt}</span>
                    {q.type === "mcq" && <ol className="ml-1 text-muted-foreground">{q.options.map((o, j) => <li key={j} className={j === q.correct_option ? "font-medium text-accent" : undefined}>{"abcdef"[j]}. {o}</li>)}</ol>}
                    {q.type === "true_false" && <span className="block text-accent">Answer: {q.correct_bool ? "True" : "False"}</span>}
                    {q.type === "short_answer" && <span className="block text-accent">Accepted: {q.accepted_answers.join(", ")}</span>}
                    {q.type === "essay" && q.marking_guide && <span className="block text-muted-foreground">Guide: {q.marking_guide}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ol>
          <Sources sources={state.sources} />
          {added.message && <Alert tone={added.ok ? "success" : "danger"}>{added.message}</Alert>}
          <SubmitButton>Add selected to question bank</SubmitButton>
        </form>
      )}
    </div>
  );
}

/** "Suggest a mark" helper shown next to manual marking forms. It only suggests; the teacher enters the mark. */
export function MarkAssist({ kind, id }: { kind: "exam_answer" | "submission"; id: string }) {
  const [state, action] = useActionState(suggestMark, {} as AiState<MarkSuggestion>);
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" /> Suggest a mark</Button>;
  return (
    <form action={action} className="space-y-2 rounded-md border border-border bg-surface-muted/50 p-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Textarea name="rubric" placeholder="Rubric or what a good answer must include (optional)" aria-label="Rubric" className="min-h-16 text-xs" />
      <SubmitButton size="sm" variant="secondary">Get suggestion</SubmitButton>
      {state.message && !state.ok && <p className="text-xs text-danger">{state.message}</p>}
      {state.data && (
        <div className="space-y-1 text-xs">
          <p><span className="font-semibold">Suggested: {state.data.suggested_marks}</span> — {state.data.rationale}</p>
          <p className="text-muted-foreground">Feedback idea: {state.data.feedback_for_student}</p>
          <p className="text-muted-foreground">You decide the final mark — enter it in the marking form.</p>
        </div>
      )}
    </form>
  );
}

export function ReportCommentRow({ studentId, termId, name, existing, canAi }: { studentId: string; termId: string; name: string; existing: { comment: string; status: string } | null; canAi: boolean }) {
  const [draft, draftAction] = useActionState(draftReportComment, {} as AiState<{ comment: string }>);
  const [saved, saveAction] = useActionState(saveReportComment, {} as FormState);
  const [text, setText] = useState(existing?.comment ?? "");
  const [aiUsed, setAiUsed] = useState(false);
  const shown = draft.data?.comment && !aiUsed ? draft.data.comment : text;
  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{name}</p>
        {existing && <Badge tone={existing.status === "approved" ? "success" : "warning"}>{existing.status === "approved" ? "Approved" : "Draft"}</Badge>}
      </div>
      <form action={saveAction} className="space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="termId" value={termId} />
        <input type="hidden" name="aiAssisted" value={aiUsed || draft.data ? "1" : "0"} />
        <Textarea name="comment" value={shown} onChange={(e) => { setText(e.target.value); setAiUsed(true); }} aria-label={`Comment for ${name}`} className="min-h-20 text-sm" maxLength={1500} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" name="approve" value="0" className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-surface-muted">Save draft</button>
          <button type="submit" name="approve" value="1" className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary-hover">Approve</button>
          {canAi && (
            <button type="submit" formAction={(fd) => { setAiUsed(false); return draftAction(fd); }} className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-sm text-royal hover:bg-surface-muted">
              <Sparkles className="h-3.5 w-3.5" /> Draft with AI
            </button>
          )}
          {(saved.message || draft.message) && <span className={saved.ok || draft.ok ? "text-xs text-accent" : "text-xs text-danger"}>{saved.message ?? draft.message}</span>}
        </div>
      </form>
    </li>
  );
}

export function InsightSummaryButton({ classId, termId }: { classId: string; termId: string }) {
  const [state, action] = useActionState(summariseInsights, {} as AiState<InsightSummary>);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="termId" value={termId} />
      <SubmitButton variant="secondary" size="sm"><Sparkles className="h-4 w-4" /> Summarise with AI</SubmitButton>
      <p className="text-xs text-muted-foreground">Students are anonymised (S1, S2…) before anything is sent to the AI.</p>
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state.data && (
        <div className="space-y-2 text-sm">
          <p>{state.data.summary}</p>
          {state.data.priorities.length > 0 && <><p className="font-medium">Priorities</p><ul className="list-disc pl-5 text-muted-foreground">{state.data.priorities.map((p) => <li key={p}>{p}</li>)}</ul></>}
          {state.data.suggested_actions.length > 0 && <><p className="font-medium">Suggested support</p><ul className="list-disc pl-5 text-muted-foreground">{state.data.suggested_actions.map((p) => <li key={p}>{p}</li>)}</ul></>}
        </div>
      )}
    </form>
  );
}
