"use client";

import { useActionState, useEffect, useRef } from "react";

import { submitWork } from "@/app/student/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

const DRAFT_KEY = (id: string) => `draft:assignment:${id}`;

/** Submission form. The typed answer is kept as a local draft so a dropped connection doesn't lose work. */
export function SubmitWorkForm({ assignmentId, existing }: { assignmentId: string; existing: string | null }) {
  const [state, action] = useActionState(submitWork, {} as FormState);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Restore an unsent draft after mount (never during render, so server and client HTML match).
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY(assignmentId));
      if (draft && textRef.current && !textRef.current.value) textRef.current.value = draft;
    } catch {
      // storage unavailable — no draft to restore
    }
  }, [assignmentId]);
  return (
    <form
      action={async (fd) => {
        await action(fd);
        try {
          localStorage.removeItem(DRAFT_KEY(assignmentId));
        } catch {
          // storage unavailable — nothing to clear
        }
      }}
      className="space-y-3"
    >
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Your answer" htmlFor="sw-body" hint="Your draft is saved on this device as you type.">
        <Textarea
          id="sw-body"
          name="body"
          ref={textRef}
          defaultValue={existing ?? ""}
          className="min-h-48"
          maxLength={20000}
          onChange={(e) => {
            try {
              localStorage.setItem(DRAFT_KEY(assignmentId), e.target.value);
            } catch {
              // storage unavailable (private mode) — typing still works
            }
          }}
        />
      </Field>
      <Field label="Attach a file (optional)" htmlFor="sw-file" error={state.errors?.file} hint="Photo of your written work, PDF or Word — up to 10 MB.">
        <input id="sw-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.pptx,.xlsx" capture="environment" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      </Field>
      <SubmitButton size="lg">{existing != null ? "Update submission" : "Submit"}</SubmitButton>
    </form>
  );
}
