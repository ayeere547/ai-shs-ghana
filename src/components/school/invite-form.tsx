"use client";

import { useActionState } from "react";

import { inviteMember } from "@/app/school/members/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

export function InviteForm({ roles, defaultRole = "teacher" }: { roles: { key: string; label: string }[]; defaultRole?: string }) {
  const [state, action] = useActionState(inviteMember, {} as FormState);
  const v = (name: string, fallback = "") => {
    const e = state.values?.[name];
    return (Array.isArray(e) ? e[0] : e) ?? fallback;
  };
  return (
    <form key={state.ok ? Date.now() : JSON.stringify(state.values ?? {})} action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Email" htmlFor="invite-email" error={state.errors?.email}>
        <Input id="invite-email" name="email" type="email" defaultValue={v("email")} required />
      </Field>
      <Field label="Full name (for new accounts)" htmlFor="invite-name" error={state.errors?.fullName}>
        <Input id="invite-name" name="fullName" defaultValue={v("fullName")} />
      </Field>
      <Field label="Role" htmlFor="invite-role" error={state.errors?.role}>
        <Select id="invite-role" name="role" defaultValue={v("role", defaultRole)}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </Select>
      </Field>
      <SubmitButton>Add member</SubmitButton>
      <p className="text-xs text-muted-foreground">Students and parents get full portals in later phases; full student records (with guardian verification) arrive in Phase 2.</p>
    </form>
  );
}
