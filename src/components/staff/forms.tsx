"use client";

import { useActionState } from "react";

import { addAssignment, linkStaffAccount, saveStaff } from "@/app/school/staff/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { Option } from "@/lib/school/lookups";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, STAFF_TITLES } from "@/lib/staff/schema";
import type { FormState } from "@/lib/validation/auth";

export type StaffInitial = Partial<Record<"id" | "staffNumber" | "title" | "firstName" | "lastName" | "gender" | "email" | "phone" | "jobTitle" | "departmentId" | "employmentType" | "employmentStatus" | "dateJoined", string | null>> & { isTeaching?: boolean };

export function StaffForm({ initial, departments }: { initial?: StaffInitial; departments: Option[] }) {
  const [state, action] = useActionState(saveStaff, {} as FormState);
  const v = (name: keyof StaffInitial, fallback = "") => {
    const e = state.values?.[name];
    if (e !== undefined) return Array.isArray(e) ? e[0] : e;
    const x = initial?.[name];
    return x == null || typeof x === "boolean" ? fallback : x;
  };
  const err = (n: string) => state.errors?.[n];
  const teaching = state.values ? state.values.isTeaching === "on" : (initial?.isTeaching ?? true);
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-4" noValidate>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title (optional)" htmlFor="title" error={err("title")}>
          <Select id="title" name="title" defaultValue={v("title")}>
            <option value="">—</option>
            {STAFF_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="First name" htmlFor="firstName" error={err("firstName")}><Input id="firstName" name="firstName" defaultValue={v("firstName")} /></Field>
        <Field label="Surname" htmlFor="lastName" error={err("lastName")}><Input id="lastName" name="lastName" defaultValue={v("lastName")} /></Field>
        <Field label="Job title" htmlFor="jobTitle" error={err("jobTitle")}><Input id="jobTitle" name="jobTitle" defaultValue={v("jobTitle", "Teacher")} /></Field>
        <Field label="Department" htmlFor="departmentId" error={err("departmentId")}>
          <Select id="departmentId" name="departmentId" defaultValue={v("departmentId")}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="Staff number" htmlFor="staffNumber" error={err("staffNumber")} hint={initial?.id ? undefined : "Leave blank to generate one."}><Input id="staffNumber" name="staffNumber" defaultValue={v("staffNumber")} /></Field>
        <Field label="Email (optional)" htmlFor="email" error={err("email")}><Input id="email" name="email" type="email" defaultValue={v("email")} /></Field>
        <Field label="Phone (optional)" htmlFor="phone" error={err("phone")}><Input id="phone" name="phone" type="tel" defaultValue={v("phone")} /></Field>
        <Field label="Gender (optional)" htmlFor="gender" error={err("gender")}>
          <Select id="gender" name="gender" defaultValue={v("gender")}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Employment type" htmlFor="employmentType" error={err("employmentType")}>
          <Select id="employmentType" name="employmentType" defaultValue={v("employmentType", "permanent")}>
            {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="employmentStatus" error={err("employmentStatus")}>
          <Select id="employmentStatus" name="employmentStatus" defaultValue={v("employmentStatus", "active")}>
            {EMPLOYMENT_STATUSES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Date joined (optional)" htmlFor="dateJoined" error={err("dateJoined")}><Input id="dateJoined" name="dateJoined" type="date" defaultValue={v("dateJoined")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isTeaching" defaultChecked={teaching} className="h-4 w-4 accent-[var(--royal)]" /> Teaching staff</label>
      <SubmitButton>{initial?.id ? "Save changes" : "Add staff member"}</SubmitButton>
    </form>
  );
}

export function AssignmentForm({ staffId, classes, subjects }: { staffId: string; classes: Option[]; subjects: Option[] }) {
  const [state, action] = useActionState(addAssignment, {} as FormState);
  return (
    <form key={state.ok ? Date.now() : "a"} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="staffId" value={staffId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Class" htmlFor="as-class" error={state.errors?.classId}>
          <Select id="as-class" name="classId" defaultValue="">
            <option value="" disabled>Choose…</option>
            {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Subject" htmlFor="as-subject" error={state.errors?.subjectId}>
          <Select id="as-subject" name="subjectId" defaultValue="">
            <option value="" disabled>Choose…</option>
            {subjects.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Periods / week" htmlFor="as-periods" error={state.errors?.periodsPerWeek}>
          <Input id="as-periods" name="periodsPerWeek" type="number" min={0} max={20} defaultValue={4} />
        </Field>
      </div>
      <SubmitButton size="sm">Add assignment</SubmitButton>
    </form>
  );
}

export function StaffLinkForm({ staffId }: { staffId: string }) {
  const [state, action] = useActionState(linkStaffAccount, {} as FormState);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-2" noValidate>
      <input type="hidden" name="staffId" value={staffId} />
      <Input name="email" type="email" placeholder="Their sign-in email" aria-label="Staff member's sign-in email" className="h-9" />
      {(state.errors?.email || state.message) && <p className="text-xs text-danger">{state.errors?.email?.[0] ?? state.message}</p>}
      <SubmitButton size="sm" variant="secondary">Link account</SubmitButton>
    </form>
  );
}
