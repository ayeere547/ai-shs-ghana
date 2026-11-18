"use client";

import { useActionState } from "react";

import { saveNotificationPreferences } from "@/app/app/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

const CATEGORIES = [
  { key: "announcements", label: "School and class announcements" },
  { key: "results", label: "Results and report cards" },
  { key: "payments", label: "Fees and payment receipts" },
  { key: "attendance", label: "Absence alerts" },
  { key: "coursework", label: "New assignments and exams" },
  { key: "messages", label: "Messages from school or family" },
];

export function NotificationForm({ prefs, emailAvailable, smsAvailable }: { prefs: { email_enabled: boolean; sms_enabled: boolean; sms_phone: string | null; categories: Record<string, boolean> }; emailAvailable: boolean; smsAvailable: boolean }) {
  const [state, action] = useActionState(saveNotificationPreferences, {} as FormState);
  return (
    <form action={action} className="space-y-4 text-sm" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <p className="text-muted-foreground">In-app notifications are always on. Choose extra channels and topics:</p>
      <label className="flex items-center gap-2"><input type="checkbox" name="emailEnabled" defaultChecked={prefs.email_enabled} className="h-4 w-4 accent-[var(--royal)]" /> Email {!emailAvailable && <span className="text-xs text-muted-foreground">(not set up on this server yet)</span>}</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="smsEnabled" defaultChecked={prefs.sms_enabled} className="h-4 w-4 accent-[var(--royal)]" /> SMS {!smsAvailable && <span className="text-xs text-muted-foreground">(not set up on this server yet)</span>}</label>
      <Field label="Mobile number for SMS" htmlFor="smsPhone" error={state.errors?.smsPhone}><Input id="smsPhone" name="smsPhone" type="tel" inputMode="tel" defaultValue={prefs.sms_phone ?? ""} placeholder="024 123 4567" /></Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Topics</legend>
        {CATEGORIES.map((c) => <label key={c.key} className="flex items-center gap-2"><input type="checkbox" name={`cat_${c.key}`} defaultChecked={prefs.categories[c.key] !== false} className="h-4 w-4 accent-[var(--royal)]" /> {c.label}</label>)}
      </fieldset>
      <p className="text-xs text-muted-foreground">Safety and account notices are always sent.</p>
      <SubmitButton>Save preferences</SubmitButton>
    </form>
  );
}
