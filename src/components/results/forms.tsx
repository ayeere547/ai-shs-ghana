"use client";

import { useActionState } from "react";

import { addBand, createScheme } from "@/app/school/results/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

export function SchemeForm() {
  const [state, action] = useActionState(createScheme, {} as FormState);
  return (
    <form key={state.ok ? Date.now() : "s"} action={action} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Scheme name" htmlFor="scheme-name" error={state.errors?.name}><Input id="scheme-name" name="name" placeholder="e.g. Internal assessments 2026" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="makeDefault" className="h-4 w-4 accent-[var(--royal)]" /> Use for results</label>
      <SubmitButton size="sm" variant="secondary">Create scheme</SubmitButton>
    </form>
  );
}

export function BandForm({ schemeId }: { schemeId: string }) {
  const [state, action] = useActionState(addBand, {} as FormState);
  return (
    <form key={state.ok ? Date.now() : "b"} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="schemeId" value={schemeId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Grade" htmlFor={`b-grade-${schemeId}`} error={state.errors?.grade}><Input id={`b-grade-${schemeId}`} name="grade" maxLength={8} /></Field>
        <Field label="From %" htmlFor={`b-min-${schemeId}`} error={state.errors?.minScore}><Input id={`b-min-${schemeId}`} name="minScore" type="number" min={0} max={100} step="0.01" /></Field>
        <Field label="To %" htmlFor={`b-max-${schemeId}`} error={state.errors?.maxScore}><Input id={`b-max-${schemeId}`} name="maxScore" type="number" min={0} max={100} step="0.01" /></Field>
        <Field label="Remark" htmlFor={`b-remark-${schemeId}`} error={state.errors?.remark}><Input id={`b-remark-${schemeId}`} name="remark" maxLength={60} /></Field>
      </div>
      <SubmitButton size="sm">Add grade band</SubmitButton>
    </form>
  );
}
