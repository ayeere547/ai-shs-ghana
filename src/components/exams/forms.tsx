"use client";

import { useActionState, useState } from "react";

import { createExam, markAnswer, recordInResults, saveQuestion } from "@/app/school/exams/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { EXAM_KINDS, QUESTION_SOURCES, QUESTION_TYPES } from "@/lib/exams/questions";
import type { Option } from "@/lib/school/lookups";
import type { FormState } from "@/lib/validation/auth";

const OPTION_IDS = ["a", "b", "c", "d", "e", "f"];

export function QuestionForm({ subjects, defaultSubject }: { subjects: Option[]; defaultSubject?: string }) {
  const [state, action] = useActionState(saveQuestion, {} as FormState);
  const v = (n: string, f = "") => {
    const e = state.values?.[n];
    return (Array.isArray(e) ? e[0] : e) ?? f;
  };
  const [type, setType] = useState(v("type", "mcq"));
  const [source, setSource] = useState(v("source", "teacher"));
  const err = (n: string) => state.errors?.[n];
  return (
    <form key={state.ok ? Date.now() : JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subject" htmlFor="q-subject" error={err("subjectId")}>
          <Select id="q-subject" name="subjectId" defaultValue={v("subjectId", defaultSubject)}>
            {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Type" htmlFor="q-type">
          <Select id="q-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Question" htmlFor="q-prompt" error={err("prompt")}><Textarea id="q-prompt" name="prompt" defaultValue={v("prompt")} maxLength={5000} /></Field>

      {type === "mcq" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Options — select the correct one</legend>
          {OPTION_IDS.map((id, i) => (
            <div key={id} className="flex items-center gap-2">
              <input type="radio" name="correct" value={id} defaultChecked={v("correct") === id} aria-label={`Option ${id.toUpperCase()} is correct`} className="h-4 w-4 accent-[var(--royal)]" />
              <span className="w-5 text-sm font-medium uppercase text-muted-foreground">{id}</span>
              <Input name={`option_${id}`} defaultValue={v(`option_${id}`)} placeholder={i < 2 ? "Required" : "Optional"} aria-label={`Option ${id.toUpperCase()}`} className="h-9" />
            </div>
          ))}
          {(err("options") || err("correct")) && <p className="text-xs text-danger">{err("options")?.[0] ?? err("correct")?.[0]}</p>}
        </fieldset>
      )}
      {type === "true_false" && (
        <fieldset>
          <legend className="text-sm font-medium">Correct answer</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="correctBool" value="true" defaultChecked={v("correctBool") === "true"} className="h-4 w-4 accent-[var(--royal)]" /> True</label>
            <label className="flex items-center gap-2"><input type="radio" name="correctBool" value="false" defaultChecked={v("correctBool") === "false"} className="h-4 w-4 accent-[var(--royal)]" /> False</label>
          </div>
          {err("correct") && <p className="text-xs text-danger">{err("correct")![0]}</p>}
        </fieldset>
      )}
      {type === "short_answer" && (
        <Field label="Accepted answers (one per line)" htmlFor="q-acc" error={err("accepted")} hint="Matching ignores capital letters and extra spaces.">
          <Textarea id="q-acc" name="accepted" defaultValue={v("accepted")} className="min-h-20" />
        </Field>
      )}
      {type === "essay" && (
        <Field label="Marking guide (only teachers see this)" htmlFor="q-guide"><Textarea id="q-guide" name="guide" defaultValue={v("guide")} maxLength={2000} /></Field>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Marks" htmlFor="q-marks" error={err("marks")}><Input id="q-marks" name="marks" type="number" min={0.5} max={100} step="0.5" defaultValue={v("marks", "1")} /></Field>
        <Field label="Difficulty" htmlFor="q-diff">
          <Select id="q-diff" name="difficulty" defaultValue={v("difficulty", "medium")}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select>
        </Field>
        <Field label="Form (optional)" htmlFor="q-form"><Input id="q-form" name="formLevel" type="number" min={1} max={6} defaultValue={v("formLevel")} /></Field>
        <Field label="Topic (optional)" htmlFor="q-topic"><Input id="q-topic" name="topic" defaultValue={v("topic")} maxLength={120} /></Field>
      </div>
      <Field label="Source" htmlFor="q-source" hint="Only mark a question as an official past question if your school holds the licence to use it.">
        <Select id="q-source" name="source" value={source} onChange={(e) => setSource(e.target.value)}>
          {QUESTION_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      {source === "licensed_past_question" && (
        <Field label="Licensed source (e.g. paper, year, licence)" htmlFor="q-note" error={err("sourceNote")}><Input id="q-note" name="sourceNote" defaultValue={v("sourceNote")} maxLength={300} /></Field>
      )}
      <SubmitButton>Add question</SubmitButton>
    </form>
  );
}

const toLocal = (d: Date) => d.toISOString().slice(0, 16);

export function ExamCreateForm({ classId, subjectId, terms, defaultTerm }: { classId: string; subjectId: string; terms: Option[]; defaultTerm?: string }) {
  const [state, action] = useActionState(createExam, {} as FormState);
  const v = (n: string, f = "") => {
    const e = state.values?.[n];
    return (Array.isArray(e) ? e[0] : e) ?? f;
  };
  const start = new Date(Date.now() + 864e5);
  start.setUTCHours(8, 0, 0, 0);
  const err = (n: string) => state.errors?.[n];
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="Title" htmlFor="ex-title" error={err("title")}><Input id="ex-title" name="title" defaultValue={v("title")} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="ex-kind"><Select id="ex-kind" name="kind" defaultValue={v("kind", "class_test")}>{EXAM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="Term" htmlFor="ex-term"><Select id="ex-term" name="termId" defaultValue={v("termId", defaultTerm)}><option value="">None</option>{terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
        <Field label="Opens (Ghana time)" htmlFor="ex-open" error={err("opensAt")}><Input id="ex-open" name="opensAt" type="datetime-local" defaultValue={v("opensAt", toLocal(start))} /></Field>
        <Field label="Closes" htmlFor="ex-close" error={err("closesAt")}><Input id="ex-close" name="closesAt" type="datetime-local" defaultValue={v("closesAt", toLocal(new Date(start.getTime() + 8 * 36e5)))} /></Field>
        <Field label="Time allowed (minutes)" htmlFor="ex-dur" error={err("durationMinutes")}><Input id="ex-dur" name="durationMinutes" type="number" min={5} max={360} defaultValue={v("durationMinutes", "40")} /></Field>
      </div>
      <Field label="Instructions (optional)" htmlFor="ex-instr"><Textarea id="ex-instr" name="instructions" defaultValue={v("instructions")} maxLength={5000} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked className="h-4 w-4 accent-[var(--royal)]" /> Shuffle question order for each student</label>
      <SubmitButton>Create exam</SubmitButton>
    </form>
  );
}

export function MarkAnswerForm({ answerId, path, max, marks, feedback }: { answerId: string; path: string; max: number; marks: number | null; feedback: string | null }) {
  const [state, action] = useActionState(markAnswer, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="answerId" value={answerId} />
      <input type="hidden" name="path" value={path} />
      {state.message && <p className={state.ok ? "text-xs text-accent" : "text-xs text-danger"}>{state.message}</p>}
      <div className="flex items-center gap-2">
        <Input name="marks" inputMode="decimal" defaultValue={marks ?? ""} aria-label="Marks awarded" className="h-9 w-20 text-right" />
        <span className="text-sm text-muted-foreground">/ {max}</span>
      </div>
      <Input name="feedback" defaultValue={feedback ?? ""} placeholder="Feedback (optional)" aria-label="Feedback" className="h-9" />
      <SubmitButton size="sm" variant="secondary">Save mark</SubmitButton>
    </form>
  );
}

export function RecordForm({ examId }: { examId: string }) {
  const [state, action] = useActionState(recordInResults, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="examId" value={examId} />
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="Weight in the term results" htmlFor="rec-weight" error={state.errors?.weight}><Input id="rec-weight" name="weight" type="number" min={1} max={100} defaultValue={20} /></Field>
      <SubmitButton size="sm" variant="secondary">Add to term results</SubmitButton>
    </form>
  );
}
