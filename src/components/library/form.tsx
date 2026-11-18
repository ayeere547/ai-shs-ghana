"use client";

import { useActionState, useState } from "react";

import { addResource } from "@/app/school/library/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { Option } from "@/lib/school/lookups";
import type { FormState } from "@/lib/validation/auth";

import { LIBRARY_KINDS } from "./library";

export function ResourceAddForm({ subjects }: { subjects: Option[] }) {
  const [state, action] = useActionState(addResource, {} as FormState);
  const v = (n: string, f = "") => {
    const e = state.values?.[n];
    return (Array.isArray(e) ? e[0] : e) ?? f;
  };
  const [source, setSource] = useState(v("source", "school"));
  const err = (n: string) => state.errors?.[n];
  return (
    <form key={state.ok ? Date.now() : JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Title" htmlFor="lr-title" error={err("title")}><Input id="lr-title" name="title" defaultValue={v("title")} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="lr-kind"><Select id="lr-kind" name="kind" defaultValue={v("kind", "ebook")}>{LIBRARY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="Author (optional)" htmlFor="lr-author"><Input id="lr-author" name="author" defaultValue={v("author")} /></Field>
        <Field label="Subject (optional)" htmlFor="lr-subject"><Select id="lr-subject" name="subjectId" defaultValue={v("subjectId")}><option value="">General</option>{subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
        <Field label="Form (optional)" htmlFor="lr-form"><Input id="lr-form" name="formLevel" type="number" min={1} max={6} defaultValue={v("formLevel")} /></Field>
      </div>
      <Field label="Link" htmlFor="lr-url" error={err("url")} hint="Or upload a file below."><Input id="lr-url" name="url" type="url" defaultValue={v("url")} placeholder="https://" /></Field>
      <Field label="File (optional)" htmlFor="lr-file" error={err("file")} hint="PDF, image, Word, PowerPoint, Excel or text, up to 10 MB.">
        <input id="lr-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.pptx,.xlsx" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      </Field>
      <Field label="Description (optional)" htmlFor="lr-desc"><Input id="lr-desc" name="description" defaultValue={v("description")} maxLength={2000} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Source" htmlFor="lr-source">
          <Select id="lr-source" name="source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="school">School&apos;s own resource</option>
            <option value="open_licence">Openly licensed</option>
            <option value="licensed_official">Licensed official material</option>
          </Select>
        </Field>
        <Field label="Who can see it" htmlFor="lr-aud"><Select id="lr-aud" name="audience" defaultValue={v("audience", "all")}><option value="all">Students and staff</option><option value="staff">Staff only</option></Select></Field>
      </div>
      {source !== "school" && (
        <Field label={source === "licensed_official" ? "Licence details (required)" : "Licence (optional)"} htmlFor="lr-lic" error={err("licenceNote")} hint="Only share copyrighted material your school is licensed to distribute.">
          <Input id="lr-lic" name="licenceNote" defaultValue={v("licenceNote")} maxLength={300} />
        </Field>
      )}
      <SubmitButton>Add to library</SubmitButton>
    </form>
  );
}
