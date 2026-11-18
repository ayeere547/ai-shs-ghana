"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

export const SOURCE_TYPES = [
  { value: "curriculum", label: "Curriculum / syllabus document" },
  { value: "teacher_notes", label: "Teacher notes" },
  { value: "textbook", label: "Textbook extract" },
  { value: "past_questions", label: "Past questions (licensed)" },
  { value: "other", label: "Other" },
];

export function KnowledgeForm({ action, subjects }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; subjects: string[] }) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const [official, setOfficial] = useState(false);
  return (
    <form key={state.ok ? Date.now() : "k"} action={formAction} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Title" htmlFor="k-title" error={state.errors?.title}><Input id="k-title" name="title" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subject (optional)" htmlFor="k-subject" hint="Leave blank for documents that apply to all subjects.">
          <Input id="k-subject" name="subjectName" list="k-subjects" />
          <datalist id="k-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Form (optional)" htmlFor="k-form"><Input id="k-form" name="formLevel" type="number" min={1} max={6} /></Field>
      </div>
      <Field label="Type" htmlFor="k-type"><Select id="k-type" name="sourceType" defaultValue="teacher_notes">{SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
      <Field label="File" htmlFor="k-file" error={state.errors?.file} hint="Text-based PDF, .txt or .md, up to 10 MB. Or paste text below.">
        <input id="k-file" name="file" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      </Field>
      <Field label="…or paste text" htmlFor="k-text"><Textarea id="k-text" name="text" className="min-h-28" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isOfficial" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="h-4 w-4 accent-[var(--royal)]" /> This is an official curriculum document</label>
      {official && <Field label="Source and permission" htmlFor="k-lic" error={state.errors?.licenceNote}><Input id="k-lic" name="licenceNote" maxLength={300} placeholder="e.g. NaCCA SHS curriculum, shared with permission" /></Field>}
      <p className="text-xs text-muted-foreground">Only add material you have the right to use. The AI cites these documents and marks official ones as such.</p>
      <SubmitButton>Add to knowledge base</SubmitButton>
    </form>
  );
}
