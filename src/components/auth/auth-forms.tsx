"use client";

import Link from "next/link";
import { useActionState } from "react";

import { register, requestPasswordReset, signIn, updatePassword } from "@/app/(auth)/actions";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

const initial: FormState = {};
const invalid = (state: FormState, name: string) => (state.errors?.[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required {...invalid(state, "email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.errors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required {...invalid(state, "password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton className="w-full">Sign in</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(register, initial);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Registration received">{state.message}</Alert>
        <ButtonLink href="/login" variant="secondary" className="w-full">Back to sign in</ButtonLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="Full name" htmlFor="fullName" error={state.errors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" required {...invalid(state, "fullName")} />
      </Field>
      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required {...invalid(state, "email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.errors?.password} hint="At least 12 characters with upper and lower case letters, a number and a symbol.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required {...invalid(state, "password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={state.errors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required {...invalid(state, "confirmPassword")} />
      </Field>
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="acceptPrivacy" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
          <span>
            I have read the <Link href="/privacy" className="font-medium text-primary hover:underline" target="_blank">privacy notice</Link> and consent to
            my account details being processed to operate this platform.
          </span>
        </label>
        {state.errors?.acceptPrivacy && <p className="text-xs text-danger">{state.errors.acceptPrivacy[0]}</p>}
      </div>
      <SubmitButton className="w-full">Create account</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required {...invalid(state, "email")} />
      </Field>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <ButtonLink href="/app" className="w-full">Continue</ButtonLink>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field label="New password" htmlFor="password" error={state.errors?.password} hint="At least 12 characters with upper and lower case letters, a number and a symbol.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required {...invalid(state, "password")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={state.errors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required {...invalid(state, "confirmPassword")} />
      </Field>
      <SubmitButton className="w-full">Update password</SubmitButton>
    </form>
  );
}
