"use client";

import { useActionState } from "react";

import { updateProfile } from "@/app/app/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action] = useActionState(updateProfile, {} as FormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Full name" htmlFor="fullName" error={state.errors?.fullName}>
        <Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" required />
      </Field>
      <Field label="Phone (optional)" htmlFor="phone" error={state.errors?.phone}>
        <Input id="phone" name="phone" defaultValue={phone} autoComplete="tel" inputMode="tel" />
      </Field>
      <SubmitButton>Save details</SubmitButton>
    </form>
  );
}
