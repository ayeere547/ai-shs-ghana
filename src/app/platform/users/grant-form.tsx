"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

import { grantPlatformRole } from "./actions";

export function GrantForm({ roles }: { roles: { key: string; label: string }[] }) {
  const [state, action] = useActionState(grantPlatformRole, {} as FormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Account email" htmlFor="email" error={state.errors?.email} hint="The person must already have an AI SHS Ghana account.">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field label="Platform role" htmlFor="role" error={state.errors?.role}>
        <Select id="role" name="role" defaultValue={roles.at(-1)?.key}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </Select>
      </Field>
      <SubmitButton>Grant access</SubmitButton>
    </form>
  );
}
