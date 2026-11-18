"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

import { decideSchool } from "./actions";

type Decision = "approve" | "reject" | "suspend" | "reactivate";

const COPY: Record<Decision, { label: string; confirm: string; needsReason: boolean; variant: "primary" | "danger" | "secondary" }> = {
  approve: { label: "Approve and activate", confirm: "Confirm approval", needsReason: false, variant: "primary" },
  reject: { label: "Reject registration", confirm: "Confirm rejection", needsReason: true, variant: "danger" },
  suspend: { label: "Suspend school", confirm: "Confirm suspension", needsReason: true, variant: "danger" },
  reactivate: { label: "Reactivate school", confirm: "Confirm reactivation", needsReason: false, variant: "primary" },
};

/** Verification / suspension controls. Each decision is confirmed, reasoned where required, and audited server-side. */
export function DecisionPanel({ schoolId, decisions }: { schoolId: string; decisions: Decision[] }) {
  const [state, action] = useActionState(decideSchool, {} as FormState);
  const [chosen, setChosen] = useState<Decision | null>(null);

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <div className="space-y-3">
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      {!chosen ? (
        <div className="flex flex-wrap gap-2">
          {decisions.map((d) => (
            <Button key={d} type="button" variant={COPY[d].variant === "danger" ? "secondary" : COPY[d].variant} onClick={() => setChosen(d)}>
              {COPY[d].label}
            </Button>
          ))}
        </div>
      ) : (
        <form action={action} className="space-y-3 rounded-md border border-border bg-surface-muted/50 p-4">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="decision" value={chosen} />
          <p className="text-sm font-medium">{COPY[chosen].label}</p>
          <Field
            label={COPY[chosen].needsReason ? "Reason (shared with the school)" : "Note (optional)"}
            htmlFor="reason"
            error={state.errors?.reason}
          >
            <Textarea id="reason" name="reason" maxLength={500} required={COPY[chosen].needsReason} />
          </Field>
          <div className="flex gap-2">
            <SubmitButton variant={COPY[chosen].variant === "danger" ? "danger" : "primary"}>{COPY[chosen].confirm}</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setChosen(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
