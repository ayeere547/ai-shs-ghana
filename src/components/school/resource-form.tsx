"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { saveResource } from "@/app/school/academics/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { ResourceField, ResourceKey } from "@/lib/school/resources";
import type { FormState } from "@/lib/validation/auth";

export function ResourceForm({
  resource,
  singular,
  fields,
  options,
  initial,
  id,
  cancelHref,
}: {
  resource: ResourceKey;
  singular: string;
  fields: ResourceField[];
  options: Record<string, { value: string; label: string }[]>;
  initial?: Record<string, unknown>;
  id?: string;
  cancelHref?: string;
}) {
  const [state, action] = useActionState(saveResource, {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !id) formRef.current?.reset();
  }, [state, id]);

  const value = (name: string) => {
    const echoed = state.values?.[name];
    if (echoed !== undefined) return Array.isArray(echoed) ? echoed[0] : echoed;
    const v = initial?.[name];
    return v == null ? "" : String(v);
  };

  return (
    <form ref={formRef} key={state.values ? JSON.stringify(state.values) : (id ?? "new")} action={action} className="space-y-4" noValidate>
      <input type="hidden" name="resource" value={resource} />
      {id && <input type="hidden" name="id" value={id} />}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const err = state.errors?.[f.name];
          const common = { id: `${resource}-${f.name}`, name: f.name, required: f.required, "aria-invalid": err ? true : undefined };
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name={f.name} defaultChecked={value(f.name) === "true" || value(f.name) === "on"} className="h-4 w-4 accent-[var(--royal)]" />
                {f.label}
              </label>
            );
          }
          const list = f.options ?? options[f.optionsFrom ?? ""] ?? [];
          return (
            <div key={f.name} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
              <Field label={f.required ? f.label : `${f.label} (optional)`} htmlFor={common.id} error={err} hint={f.hint}>
                {f.type === "select" ? (
                  <Select {...common} defaultValue={value(f.name)}>
                    <option value="">{f.required ? "Choose…" : "None"}</option>
                    {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea {...common} defaultValue={value(f.name)} maxLength={f.max} />
                ) : (
                  <Input {...common} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.min} max={f.type === "number" ? f.max : undefined} maxLength={f.type === "text" ? f.max : undefined} defaultValue={value(f.name)} />
                )}
              </Field>
              {f.type === "select" && f.optionsFrom && list.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Add {f.label.toLowerCase()}s first to link them here.</p>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm">{id ? "Save changes" : `Add ${singular}`}</SubmitButton>
        {id && cancelHref && <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">Cancel</Link>}
      </div>
    </form>
  );
}
