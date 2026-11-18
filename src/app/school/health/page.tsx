import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { searchTerm } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { recordClinicVisit, saveHealthRecord } from "../operations/actions";

export const metadata: Metadata = { title: "Health records" };

const OUTCOME: Record<string, string> = { returned_to_class: "Returned to class", rest_in_sickbay: "Rested in sickbay", sent_home: "Sent home", referred_to_hospital: "Referred to hospital" };
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const SICKLE = ["AA", "AS", "SS", "SC", "unknown"];

async function StudentHealth({ schoolId, studentId, writable }: { schoolId: string; studentId: string; writable: boolean }) {
  const supabase = await createClient();
  const [{ data: st }, { data: rec }, { data: visits }, { data: guardians }] = await Promise.all([
    supabase.from("students").select("id, first_name, last_name, student_number, date_of_birth, residency").eq("id", studentId).eq("school_id", schoolId).maybeSingle(),
    supabase.from("health_records").select("blood_group, sickle_cell_status, allergies, conditions, medications, notes, updated_at").eq("student_id", studentId).maybeSingle(),
    supabase.from("clinic_visits").select("id, visited_at, complaint, treatment, outcome, share_with_guardian").eq("student_id", studentId).order("visited_at", { ascending: false }).limit(30),
    supabase.from("student_guardians").select("relationship, guardians(full_name, phone)").eq("student_id", studentId).eq("is_emergency_contact", true).returns<{ relationship: string; guardians: { full_name: string; phone: string } }[]>(),
  ]);
  if (!st) return <Card><EmptyState title="Student not found" /></Card>;
  // Access logging: every opening of a student's health record is audited.
  await supabase.rpc("log_audit", { p_action: "health.record_viewed", p_entity_type: "student", p_entity_id: studentId, p_summary: "Health record viewed", p_school_id: schoolId });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`${st.first_name} ${st.last_name}`} description={`${st.student_number} · ${st.residency} · born ${formatDate(st.date_of_birth)}`} />
        <CardBody className="space-y-1 text-sm">
          <p className="font-medium">Emergency contacts</p>
          {guardians?.length ? guardians.map((g, i) => <p key={i}>{g.guardians.full_name} ({g.relationship}) · <a href={`tel:${g.guardians.phone.replace(/[^+0-9]/g, "")}`} className="text-royal hover:underline">{g.guardians.phone}</a></p>) : <p className="text-muted-foreground">None recorded — ask the school office to add guardians.</p>}
        </CardBody>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Health record" description={rec?.updated_at ? `Updated ${formatDate(rec.updated_at)}` : "No record yet"} />
          <CardBody>
            <ActionForm action={saveHealthRecord} resetOnSuccess={false}>
              <input type="hidden" name="studentId" value={st.id} />
              <fieldset disabled={!writable} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Blood group" htmlFor="h-bg"><Select id="h-bg" name="bloodGroup" defaultValue={rec?.blood_group ?? ""}><option value="">Unknown</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}</Select></Field>
                  <Field label="Sickle cell status" htmlFor="h-sc"><Select id="h-sc" name="sickleCell" defaultValue={rec?.sickle_cell_status ?? ""}><option value="">Not recorded</option>{SICKLE.map((b) => <option key={b}>{b}</option>)}</Select></Field>
                </div>
                <Field label="Allergies" htmlFor="h-al"><Textarea id="h-al" name="allergies" defaultValue={rec?.allergies ?? ""} className="min-h-16" /></Field>
                <Field label="Conditions" htmlFor="h-co"><Textarea id="h-co" name="conditions" defaultValue={rec?.conditions ?? ""} className="min-h-16" /></Field>
                <Field label="Medications" htmlFor="h-me"><Textarea id="h-me" name="medications" defaultValue={rec?.medications ?? ""} className="min-h-16" /></Field>
                <Field label="Notes" htmlFor="h-no"><Textarea id="h-no" name="notes" defaultValue={rec?.notes ?? ""} className="min-h-16" /></Field>
              </fieldset>
              {writable && <SubmitButton>Save record</SubmitButton>}
            </ActionForm>
          </CardBody>
        </Card>
        <div className="space-y-6">
          {writable && (
            <Card>
              <CardHeader title="Record a clinic visit" />
              <CardBody>
                <ActionForm action={recordClinicVisit}>
                  <input type="hidden" name="studentId" value={st.id} />
                  <Field label="Complaint" htmlFor="v-c"><Input id="v-c" name="complaint" maxLength={500} /></Field>
                  <Field label="Treatment given" htmlFor="v-t"><Textarea id="v-t" name="treatment" maxLength={1000} className="min-h-16" /></Field>
                  <Field label="Outcome" htmlFor="v-o"><Select id="v-o" name="outcome">{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="share" className="h-4 w-4 accent-[var(--royal)]" /> Share this visit with the student&apos;s guardians</label>
                  <SubmitButton>Save visit</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Clinic visits" />
            <ul className="divide-y divide-border">
              {(visits ?? []).map((v) => (
                <li key={v.id} className="px-5 py-3 text-sm">
                  <p className="font-medium">{v.complaint} {v.share_with_guardian && <Badge tone="info" className="ml-1">Shared with family</Badge>}</p>
                  {v.treatment && <p className="text-muted-foreground">{v.treatment}</p>}
                  <p className="text-xs text-muted-foreground">{formatDate(v.visited_at, { dateStyle: "medium", timeStyle: "short" })} · {OUTCOME[v.outcome]}</p>
                </li>
              ))}
              {!visits?.length && <li className="px-5 py-3 text-sm text-muted-foreground">No visits recorded.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ q?: string; student?: string }> }) {
  const { school } = await requireSchoolPermission("health.manage");
  const params = await searchParams;
  const supabase = await createClient();
  const q = searchTerm(params.q);
  const { data: matches } = q
    ? await supabase.from("students").select("id, first_name, last_name, student_number").eq("school_id", school.schoolId).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_number.ilike.%${q}%`).limit(20)
    : { data: null };
  const studentId = params.student && /^[0-9a-f-]{36}$/i.test(params.student) ? params.student : null;

  return (
    <>
      <PageHeader title="Health records" description="Confidential. Only authorised health personnel can see this page; every record you open is logged." />
      <Alert tone="warning" className="mb-4">Share health information only on a need-to-know basis, in line with the Data Protection Act, 2012 (Act 843) and your school&apos;s policy.</Alert>
      <form className="mb-4 flex gap-3" role="search">
        <Input name="q" defaultValue={params.q} placeholder="Find a student by name or number…" aria-label="Find a student" className="sm:max-w-sm" />
        <button type="submit" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-surface-muted">Search</button>
      </form>
      {matches && (
        <Card className="mb-6">
          {matches.length ? (
            <ul className="divide-y divide-border">{matches.map((m) => <li key={m.id}><Link href={`/school/health?student=${m.id}`} className="block px-5 py-2 text-sm hover:bg-surface-muted">{m.first_name} {m.last_name} <span className="text-xs text-muted-foreground">{m.student_number}</span></Link></li>)}</ul>
          ) : <EmptyState icon={HeartPulse} title="No matching students" />}
        </Card>
      )}
      {studentId && <StudentHealth schoolId={school.schoolId} studentId={studentId} writable={school.schoolStatus === "active"} />}
    </>
  );
}
