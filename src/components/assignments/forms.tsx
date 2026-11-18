"use client";

import { useActionState } from "react";

import { createAssignment, markSubmission } from "@/app/school/assignments/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

const inAWeek = () => {
  const d = new Date(Date.now() + 7 * 864e5);
  d.setUTCHours(16, 0, 0, 0);
  return d.toISOString().slice(0, 16);
};

export function AssignmentCreateForm({ classId, subjectId }: { classId: string; subjectId: string }) {
  const [state, action] = useActionState(createAssignment, {} as FormState);
  const v = (n: string, f = "") => {
    const e = state.values?.[n];
    return (Array.isArray(e) ? e[0] : e) ?? f;
  };
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="Title" htmlFor="as-title" error={state.errors?.title}><Input id="as-title" name="title" defaultValue={v("title")} /></Field>
      <Field label="Instructions" htmlFor="as-instr" error={state.errors?.instructions}><Textarea id="as-instr" name="instructions" defaultValue={v("instructions")} className="min-h-32" maxLength={10000} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Due (Ghana time)" htmlFor="as-due" error={state.errors?.dueAt}><Input id="as-due" name="dueAt" type="datetime-local" defaultValue={v("dueAt", inAWeek())} /></Field>
        <Field label="Marked out of" htmlFor="as-max" error={state.errors?.maxScore}><Input id="as-max" name="maxScore" type="number" min={1} max={1000} defaultValue={v("maxScore", "10")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowLate" className="h-4 w-4 accent-[var(--royal)]" /> Accept late submissions</label>
      <SubmitButton>Set assignment</SubmitButton>
    </form>
  );
}

export function MarkForm({ submissionId, assignmentId, maxScore, score, feedback }: { submissionId: string; assignmentId: string; maxScore: number; score: number | null; feedback: string | null }) {
  const [state, action] = useActionState(markSubmission, {} as FormState);
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="flex items-center gap-2">
        <label htmlFor={`sc-${submissionId}`} className="text-sm">Score</label>
        <Input id={`sc-${submissionId}`} name="score" inputMode="decimal" defaultValue={score ?? ""} className="h-9 w-20 text-right" />
        <span className="text-sm text-muted-foreground">/ {maxScore}</span>
      </div>
      <Textarea name="feedback" defaultValue={feedback ?? ""} placeholder="Feedback for the student (optional)" aria-label="Feedback" className="min-h-16" maxLength={5000} />
      <SubmitButton size="sm">{score == null ? "Mark and return" : "Update mark"}</SubmitButton>
    </form>
  );
}
