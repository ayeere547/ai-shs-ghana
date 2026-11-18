"use client";

import { useActionState, useState } from "react";

import { addGuardian, changeStatus, commitImport, linkAccount, previewImport, promoteClass, saveStudent, type ImportState } from "@/app/school/students/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Field, Input, Select, Table, Td, Th } from "@/components/ui/primitives";
import type { Option } from "@/lib/school/lookups";
import { GENDERS, RELATIONSHIPS, STUDENT_STATUSES } from "@/lib/students/schema";
import type { FormState } from "@/lib/validation/auth";

const today = () => new Date().toISOString().slice(0, 10);

function useValue(state: FormState, initial?: Record<string, unknown>) {
  return (name: string, fallback = "") => {
    const e = state.values?.[name];
    if (e !== undefined) return Array.isArray(e) ? e[0] : e;
    const v = initial?.[name];
    return v == null ? fallback : String(v);
  };
}

export type StudentFormInitial = {
  id?: string;
  studentNumber?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string | null;
  admissionDate?: string;
  programmeId?: string | null;
  classId?: string | null;
  houseId?: string | null;
  residency?: string;
  previousSchool?: string | null;
};

export function StudentForm({ initial, classes, programmes, houses }: { initial?: StudentFormInitial; classes: Option[]; programmes: Option[]; houses: Option[] }) {
  const [state, action] = useActionState(saveStudent, {} as FormState);
  const v = useValue(state, initial);
  const err = (n: string) => state.errors?.[n];
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-4" noValidate>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="First name" htmlFor="firstName" error={err("firstName")}><Input id="firstName" name="firstName" defaultValue={v("firstName")} required /></Field>
        <Field label="Middle name (optional)" htmlFor="middleName" error={err("middleName")}><Input id="middleName" name="middleName" defaultValue={v("middleName")} /></Field>
        <Field label="Surname" htmlFor="lastName" error={err("lastName")}><Input id="lastName" name="lastName" defaultValue={v("lastName")} required /></Field>
        <Field label="Gender" htmlFor="gender" error={err("gender")}>
          <Select id="gender" name="gender" defaultValue={v("gender")} required>
            <option value="" disabled>Choose…</option>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </Field>
        <Field label="Date of birth (optional)" htmlFor="dateOfBirth" error={err("dateOfBirth")}><Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={v("dateOfBirth")} max={today()} /></Field>
        <Field label="Student number" htmlFor="studentNumber" error={err("studentNumber")} hint={initial?.id ? undefined : "Leave blank to generate one automatically."}>
          <Input id="studentNumber" name="studentNumber" defaultValue={v("studentNumber")} />
        </Field>
        <Field label="Admission date" htmlFor="admissionDate" error={err("admissionDate")}><Input id="admissionDate" name="admissionDate" type="date" defaultValue={v("admissionDate", today())} required /></Field>
        <Field label="Programme" htmlFor="programmeId" error={err("programmeId")}>
          <Select id="programmeId" name="programmeId" defaultValue={v("programmeId")}>
            <option value="">None</option>
            {programmes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Class" htmlFor="classId" error={err("classId")}>
          <Select id="classId" name="classId" defaultValue={v("classId")}>
            <option value="">Not assigned</option>
            {classes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="House" htmlFor="houseId" error={err("houseId")}>
          <Select id="houseId" name="houseId" defaultValue={v("houseId")}>
            <option value="">None</option>
            {houses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Day or boarding" htmlFor="residency" error={err("residency")}>
          <Select id="residency" name="residency" defaultValue={v("residency", "day")}>
            <option value="day">Day</option>
            <option value="boarding">Boarding</option>
          </Select>
        </Field>
        <Field label="Previous school (optional)" htmlFor="previousSchool" error={err("previousSchool")}><Input id="previousSchool" name="previousSchool" defaultValue={v("previousSchool")} /></Field>
      </div>
      <SubmitButton>{initial?.id ? "Save changes" : "Admit student"}</SubmitButton>
    </form>
  );
}

export function GuardianForm({ studentId }: { studentId: string }) {
  const [state, action] = useActionState(addGuardian, {} as FormState);
  const v = useValue(state);
  return (
    <form key={state.ok ? Date.now() : JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="studentId" value={studentId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Full name" htmlFor="g-name" error={state.errors?.fullName}><Input id="g-name" name="fullName" defaultValue={v("fullName")} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone" htmlFor="g-phone" error={state.errors?.phone}><Input id="g-phone" name="phone" type="tel" defaultValue={v("phone")} /></Field>
        <Field label="Relationship" htmlFor="g-rel" error={state.errors?.relationship}>
          <Select id="g-rel" name="relationship" defaultValue={v("relationship", "guardian")}>
            {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Email (optional)" htmlFor="g-email" error={state.errors?.email}><Input id="g-email" name="email" type="email" defaultValue={v("email")} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" className="h-4 w-4 accent-[var(--royal)]" /> Primary contact</label>
      <SubmitButton size="sm">Add guardian</SubmitButton>
    </form>
  );
}

export function LinkAccountForm({ kind, recordId, studentId, label }: { kind: "student" | "guardian"; recordId: string; studentId: string; label: string }) {
  const [state, action] = useActionState(linkAccount, {} as FormState);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex-1">
        <Input name="email" type="email" placeholder={`${label}'s account email`} aria-label={`${label}'s account email`} className="h-9" />
        {(state.errors?.email || state.message) && <p className="mt-1 text-xs text-danger">{state.errors?.email?.[0] ?? state.message}</p>}
      </div>
      <SubmitButton size="sm" variant="secondary">Link account</SubmitButton>
    </form>
  );
}

export function StatusForm({ studentId, current, classes }: { studentId: string; current: string; classes: Option[] }) {
  const [state, action] = useActionState(changeStatus, {} as FormState);
  const [status, setStatus] = useState(current === "active" ? "transferred" : "active");
  const needsReason = status === "transferred" || status === "withdrawn";
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="studentId" value={studentId} />
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New status" htmlFor="st-status">
          <Select id="st-status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STUDENT_STATUSES.filter((s) => s.value !== current || s.value === "active").map((s) => <option key={s.value} value={s.value}>{s.value === "active" && current === "active" ? "Active — move to another class" : s.label}</option>)}
          </Select>
        </Field>
        {status === "active" && (
          <Field label="Class" htmlFor="st-class">
            <Select id="st-class" name="classId" defaultValue="">
              <option value="">Keep current class</option>
              {classes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Effective date" htmlFor="st-date"><Input id="st-date" name="effectiveOn" type="date" defaultValue={today()} /></Field>
      </div>
      <Field label={needsReason ? "Reason (required)" : "Reason (optional)"} htmlFor="st-reason"><Input id="st-reason" name="reason" maxLength={500} required={needsReason} /></Field>
      <SubmitButton size="sm" variant="secondary">Record change</SubmitButton>
    </form>
  );
}

export function PromoteForm({ classes }: { classes: Option[] }) {
  const [state, action] = useActionState(promoteClass, {} as FormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Move every active student in" htmlFor="fromClass" error={state.errors?.fromClass}>
          <Select id="fromClass" name="fromClass" defaultValue="">
            <option value="" disabled>Choose a class…</option>
            {classes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="To" htmlFor="toClass" error={state.errors?.toClass}>
          <Select id="toClass" name="toClass" defaultValue="">
            <option value="" disabled>Choose…</option>
            <option value="graduate">Graduate (final year)</option>
            {classes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-[var(--royal)]" />
        <span>I understand this moves every active student in the class at once. Each move is recorded in the students&apos; history.</span>
      </label>
      {state.errors?.confirm && <p className="text-xs text-danger">{state.errors.confirm[0]}</p>}
      <SubmitButton>Move students</SubmitButton>
    </form>
  );
}

export function ImportWizard() {
  const [preview, previewAction] = useActionState(previewImport, {} as ImportState);
  const [result, commitAction] = useActionState(commitImport, {} as ImportState);

  if (result.ok) return <Alert tone="success" title="Import complete">{result.message}</Alert>;

  return (
    <div className="space-y-6">
      <form action={previewAction} className="space-y-3">
        {preview.message && !preview.ok && <Alert tone="danger">{preview.message}</Alert>}
        <Field label="CSV file" htmlFor="file" hint="Up to 1,000 students and 1 MB per file. From Excel: File → Save As → CSV UTF-8.">
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
        </Field>
        <SubmitButton variant="secondary">Check file</SubmitButton>
      </form>

      {preview.ok && preview.summary && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="info">{preview.summary.total} rows</Badge>
            <Badge tone="success">{preview.summary.valid} ready to import</Badge>
            {preview.summary.duplicates > 0 && <Badge tone="warning">{preview.summary.duplicates} duplicates skipped</Badge>}
            {preview.summary.invalid > 0 && <Badge tone="danger">{preview.summary.invalid} with errors</Badge>}
          </div>
          {preview.rows && preview.rows.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              <Table>
                <thead><tr><Th>Row</Th><Th>Student</Th><Th>Problem</Th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <Td className="tabular-nums text-muted-foreground">{r.line}</Td>
                      <Td>{r.label}</Td>
                      <Td className={r.duplicate ? "text-warning" : "text-danger"}>{r.duplicate ?? r.errors.join("; ")}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {result.message && <Alert tone="danger">{result.message}</Alert>}
          {preview.summary.valid > 0 ? (
            <form action={commitAction}>
              <input type="hidden" name="csv" value={preview.csv} />
              <SubmitButton>Import {preview.summary.valid} students</SubmitButton>
              <p className="mt-2 text-xs text-muted-foreground">Rows with errors or duplicates are skipped. Fix them in the file and import it again.</p>
            </form>
          ) : (
            <Alert tone="warning">Nothing can be imported yet — fix the rows above and check the file again.</Alert>
          )}
        </div>
      )}
    </div>
  );
}
