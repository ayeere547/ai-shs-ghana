"use client";

import { useActionState, type ReactNode } from "react";

import type { FormState } from "@/lib/validation/auth";

import { Alert } from "./primitives";

/** Wraps a server action with result messages; fields come from the (server-rendered) children. */
export function ActionForm({ action, children, className, resetOnSuccess = true }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const firstError = state.errors ? Object.values(state.errors).flat().find(Boolean) : undefined;
  const message = state.message ?? firstError;
  return (
    <form key={resetOnSuccess && state.ok ? Date.now() : "f"} action={formAction} className={className ?? "space-y-3"} noValidate>
      {message && <Alert tone={state.ok ? "success" : "danger"}>{message}</Alert>}
      {children}
    </form>
  );
}
