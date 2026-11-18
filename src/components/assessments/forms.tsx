"use client";

import { useActionState, useMemo, useState } from "react";

import { createAssessment, saveScores } from "@/app/school/assessments/actions";
import { ASSESSMENT_KINDS } from "@/lib/assessments/kinds";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { Option } from "@/lib/school/lookups";
import type { FormState } from "@/lib/validation/auth";

export function AssessmentForm({ terms, pairs, defaultTerm }: { terms: Option[]; pairs: { classId: string; className: string; subjectId: string; subjectName: string }[]; defaultTerm?: string }) {
  const [state, action] = useActionState(createAssessment, {} as FormState);
  const v = (n: string, f = "") => {
    const e = state.values?.[n];
    return (Array.isArray(e) ? e[0] : e) ?? f;
  };
  const [classId, setClassId] = useState(v("classId"));
  const classes = useMemo(() => [...new Map(pairs.map((p) => [p.classId, p.className])).entries()], [pairs]);
  const subjects = pairs.filter((p) => p.classId === classId);
  const err = (n: string) => state.errors?.[n];
  return (
    <form action={action} className="space-y-3" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="Term" htmlFor="termId" error={err("termId")}>
        <Select id="termId" name="termId" defaultValue={v("termId", defaultTerm)}>
          {terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class" htmlFor="classId" error={err("classId")}>
          <Select id="classId" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </Field>
        <Field label="Subject" htmlFor="subjectId" error={err("subjectId")}>
          <Select id="subjectId" name="subjectId" defaultValue={v("subjectId")} disabled={!classId} key={classId}>
            <option value="" disabled>{classId ? "Choose…" : "Choose a class first"}</option>
            {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Name" htmlFor="name" error={err("name")}><Input id="name" name="name" defaultValue={v("name")} placeholder="e.g. Class test 1" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type" htmlFor="kind" error={err("kind")}>
          <Select id="kind" name="kind" defaultValue={v("kind", "class_test")}>
            {ASSESSMENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label="Marked out of" htmlFor="maxScore" error={err("maxScore")}><Input id="maxScore" name="maxScore" type="number" min={1} max={1000} step="0.5" defaultValue={v("maxScore", "100")} /></Field>
        <Field label="Weight" htmlFor="weight" error={err("weight")} hint="Share of the term total"><Input id="weight" name="weight" type="number" min={1} max={100} step="0.5" defaultValue={v("weight", "10")} /></Field>
      </div>
      <Field label="Date (optional)" htmlFor="assessedOn" error={err("assessedOn")}><Input id="assessedOn" name="assessedOn" type="date" defaultValue={v("assessedOn")} /></Field>
      <SubmitButton>Create assessment</SubmitButton>
    </form>
  );
}

export function ScoreSheet({ assessmentId, maxScore, students, readOnly }: { assessmentId: string; maxScore: number; students: { id: string; name: string; number: string; score: number | null }[]; readOnly?: boolean }) {
  const [state, action] = useActionState(saveScores, {} as FormState);
  const value = (id: string, fallback: number | null) => {
    const e = state.values?.[`score:${id}`];
    if (e !== undefined) return Array.isArray(e) ? e[0] : e;
    return fallback == null ? "" : String(fallback);
  };
  const entered = students.filter((s) => s.score != null);
  const avg = entered.length ? entered.reduce((n, s) => n + (s.score ?? 0), 0) / entered.length : null;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-4">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <p className="text-sm text-muted-foreground">
        {entered.length} of {students.length} entered{avg != null && ` · class average ${avg.toFixed(1)} / ${maxScore}`}. Leave a box empty for no score yet.
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {students.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2">
            <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
            <label htmlFor={`score-${s.id}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{s.number}</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id={`score-${s.id}`}
                name={`score:${s.id}`}
                inputMode="decimal"
                defaultValue={value(s.id, s.score)}
                disabled={readOnly}
                aria-invalid={state.errors?.[`score:${s.id}`] ? true : undefined}
                className="h-9 w-20 rounded-md border border-border bg-surface px-2 text-right text-sm tabular-nums focus:border-primary focus:outline-none aria-[invalid=true]:border-danger"
              />
              <span className="w-12 text-xs text-muted-foreground">/ {maxScore}</span>
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && <SubmitButton size="lg">Save scores</SubmitButton>}
    </form>
  );
}
