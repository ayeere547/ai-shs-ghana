"use client";

import { useActionState, useState } from "react";

import { saveRegister } from "@/app/school/attendance/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/validation/auth";

const STATUSES = [
  { value: "present", label: "Present", short: "P", cls: "peer-checked:bg-accent peer-checked:text-white" },
  { value: "late", label: "Late", short: "L", cls: "peer-checked:bg-warning peer-checked:text-white" },
  { value: "absent", label: "Absent", short: "A", cls: "peer-checked:bg-danger peer-checked:text-white" },
  { value: "excused", label: "Excused", short: "E", cls: "peer-checked:bg-info peer-checked:text-white" },
] as const;

export type RegisterRow = { id: string; name: string; number: string; status: string | null; remark: string | null };

/** Touch-friendly register: one row per student, statuses as large toggle buttons. */
export function Register({ classId, date, students, readOnly }: { classId: string; date: string; students: RegisterRow[]; readOnly?: boolean }) {
  const [state, action] = useActionState(saveRegister, {} as FormState);
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(students.map((s) => [s.id, s.status ?? "present"])));
  const counts = STATUSES.map((s) => ({ ...s, n: Object.values(marks).filter((m) => m === s.value).length }));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="date" value={date} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{counts.map((c) => `${c.n} ${c.label.toLowerCase()}`).join(" · ")}</p>
        {!readOnly && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, "present"])))}>
            Mark all present
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {students.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium"><span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.number}</p>
            </div>
            <fieldset className="flex gap-1" disabled={readOnly}>
              <legend className="sr-only">Attendance for {s.name}</legend>
              {STATUSES.map((st) => (
                <label key={st.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`status:${s.id}`}
                    value={st.value}
                    checked={marks[s.id] === st.value}
                    onChange={() => setMarks((m) => ({ ...m, [s.id]: st.value }))}
                    className="peer sr-only"
                  />
                  <span className={cn("flex h-9 min-w-9 items-center justify-center rounded-md border border-border px-2 text-sm font-medium text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring", st.cls)} title={st.label}>
                    <span className="sm:hidden">{st.short}</span>
                    <span className="hidden sm:inline">{st.label}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {(marks[s.id] === "absent" || marks[s.id] === "excused" || s.remark) && (
              <input name={`remark:${s.id}`} defaultValue={s.remark ?? ""} placeholder="Remark (optional)" aria-label={`Remark for ${s.name}`} maxLength={200} disabled={readOnly} className="h-9 rounded-md border border-border bg-surface px-2 text-sm sm:w-44" />
            )}
          </li>
        ))}
      </ul>
      {!readOnly && <SubmitButton size="lg">Save register</SubmitButton>}
    </form>
  );
}
