"use client";

import { useActionState } from "react";

import { generate, saveSlot, type GenerateState } from "@/app/school/timetable/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { Option } from "@/lib/school/lookups";
import type { FormState } from "@/lib/validation/auth";

export function SlotForm({ termId, classId, day, periodId, subjects, current }: { termId: string; classId: string; day: number; periodId: string; subjects: (Option & { taught: boolean })[]; current?: { subjectId: string; room: string | null } }) {
  const [state, action] = useActionState(saveSlot, {} as FormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      {(["termId", "classId", "periodId"] as const).map((k) => <input key={k} type="hidden" name={k} value={{ termId, classId, periodId }[k]} />)}
      <input type="hidden" name="day" value={day} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Subject" htmlFor="slot-subject">
        <Select id="slot-subject" name="subjectId" defaultValue={current?.subjectId ?? ""}>
          <option value="" disabled>Choose…</option>
          <optgroup label="Assigned to this class">
            {subjects.filter((s) => s.taught).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </optgroup>
          <optgroup label="Other subjects (no teacher)">
            {subjects.filter((s) => !s.taught).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </optgroup>
        </Select>
      </Field>
      <Field label="Room (optional)" htmlFor="slot-room" hint="Rooms are checked for double-booking too.">
        <Input id="slot-room" name="room" defaultValue={current?.room ?? ""} maxLength={40} />
      </Field>
      <SubmitButton size="sm">Save lesson</SubmitButton>
    </form>
  );
}

export function GenerateForm({ termId, termLabel }: { termId: string; termLabel: string }) {
  const [state, action] = useActionState(generate, {} as GenerateState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="termId" value={termId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {state.unplaced && state.unplaced.length > 0 && (
        <Alert tone="warning" title="Some lessons didn't fit">
          <ul className="mt-1 list-disc pl-4">{state.unplaced.map((u) => <li key={u}>{u}</li>)}</ul>
          <p className="mt-1">Add periods or school days, reduce periods per week, or spread a teacher&apos;s classes.</p>
        </Alert>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-[var(--royal)]" />
        <span>Replace the {termLabel} timetable for every class that has teaching assignments.</span>
      </label>
      <SubmitButton variant="secondary" size="sm">Generate timetable</SubmitButton>
    </form>
  );
}
