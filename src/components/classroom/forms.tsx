"use client";

import { useActionState, useState } from "react";

import { createPost, postAnnouncement, saveMaterial } from "@/app/school/classroom/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

const KINDS = [
  { value: "note", label: "Notes" },
  { value: "video", label: "Video lesson (link)" },
  { value: "document", label: "Document (upload)" },
  { value: "link", label: "Web link" },
];

export function MaterialForm({ classId, subjectId }: { classId: string; subjectId: string }) {
  const [state, action] = useActionState(saveMaterial, {} as FormState);
  const v = (n: string, f = "") => {
    const e = state.values?.[n];
    return (Array.isArray(e) ? e[0] : e) ?? f;
  };
  const [kind, setKind] = useState(v("kind", "note"));
  return (
    <form key={state.ok ? Date.now() : JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Title" htmlFor="m-title" error={state.errors?.title}><Input id="m-title" name="title" defaultValue={v("title")} /></Field>
      <Field label="Type" htmlFor="m-kind">
        <Select id="m-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
      </Field>
      {kind === "note" && (
        <Field label="Notes" htmlFor="m-body" error={state.errors?.body} hint="Plain text. Leave a blank line between paragraphs.">
          <Textarea id="m-body" name="body" defaultValue={v("body")} className="min-h-48" maxLength={50000} />
        </Field>
      )}
      {(kind === "video" || kind === "link") && (
        <Field label={kind === "video" ? "Video link" : "Web address"} htmlFor="m-url" error={state.errors?.url} hint={kind === "video" ? "e.g. a YouTube lesson. Students on low data can skip it." : undefined}>
          <Input id="m-url" name="url" type="url" defaultValue={v("url")} placeholder="https://" />
        </Field>
      )}
      <Field label={kind === "document" ? "File" : "Attachment (optional)"} htmlFor="m-file" error={state.errors?.file} hint="PDF, image, Word, PowerPoint, Excel or text, up to 10 MB.">
        <input id="m-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.pptx,.xlsx" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      </Field>
      <Field label="Short description (optional)" htmlFor="m-desc"><Input id="m-desc" name="description" defaultValue={v("description")} maxLength={2000} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked className="h-4 w-4 accent-[var(--royal)]" /> Publish to students now</label>
      <SubmitButton>Save material</SubmitButton>
    </form>
  );
}

export function AnnouncementForm({ classId, subjectId, schoolWide }: { classId?: string; subjectId?: string; schoolWide?: boolean }) {
  const [state, action] = useActionState(postAnnouncement, {} as FormState);
  return (
    <form key={state.ok ? Date.now() : "a"} action={action} className="space-y-3" noValidate>
      {classId && <input type="hidden" name="classId" value={classId} />}
      {subjectId && <input type="hidden" name="subjectId" value={subjectId} />}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Title" htmlFor="an-title" error={state.errors?.title}><Input id="an-title" name="title" /></Field>
      <Field label="Message" htmlFor="an-body" error={state.errors?.body}><Textarea id="an-body" name="body" maxLength={5000} /></Field>
      {schoolWide && (
        <Field label="Who should see it" htmlFor="an-aud">
          <Select id="an-aud" name="audience" defaultValue="all">
            <option value="all">Everyone in the school</option>
            <option value="staff">Staff only</option>
            <option value="students">Students (and staff)</option>
          </Select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isUrgent" className="h-4 w-4 accent-[var(--royal)]" /> Mark as urgent</label>
      <SubmitButton size="sm">Post announcement</SubmitButton>
    </form>
  );
}

export function PostForm({ classId, subjectId, parentId, placeholder = "Ask a question or share something with the class…" }: { classId: string; subjectId: string; parentId?: string; placeholder?: string }) {
  const [state, action] = useActionState(createPost, {} as FormState);
  return (
    <form key={state.ok ? Date.now() : "p"} action={action} className="space-y-2" noValidate>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <Textarea name="body" placeholder={placeholder} aria-label={parentId ? "Reply" : "New post"} maxLength={2000} className={parentId ? "min-h-16" : undefined} />
      {(state.errors?.body || state.message) && <p className="text-xs text-danger">{state.errors?.body?.[0] ?? state.message}</p>}
      <SubmitButton size="sm" variant={parentId ? "secondary" : "primary"}>{parentId ? "Reply" : "Post"}</SubmitButton>
    </form>
  );
}
