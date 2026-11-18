import { ArrowLeft, Link2, ShieldCheck, ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { saveSubjects, unlinkAccount, updateGuardianLink } from "@/app/school/students/actions";
import { GuardianForm, LinkAccountForm, StatusForm, StudentForm } from "@/components/students/forms";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { fullName, STUDENT_STATUSES } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Student" };

type Student = {
  id: string; student_number: string; first_name: string; middle_name: string | null; last_name: string; gender: string; date_of_birth: string | null;
  admission_date: string; programme_id: string | null; class_id: string | null; house_id: string | null; residency: string; status: string;
  previous_school: string | null; user_id: string | null;
};
type GuardianLink = { id: string; relationship: string; is_primary: boolean; can_view_records: boolean; guardians: { id: string; full_name: string; phone: string; email: string | null; user_id: string | null } };

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { school } = await requireSchoolPermission("students.read");
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: s } = await supabase.from("students").select("*").eq("id", id).eq("school_id", school.schoolId).maybeSingle<Student>();
  if (!s) notFound();

  const canManage = school.permissions.has("students.manage") && school.schoolStatus === "active";
  const [l, { data: guardians }, { data: history }, { data: regs }, { data: attendance }] = await Promise.all([
    schoolLookups(school.schoolId),
    supabase.from("student_guardians").select("id, relationship, is_primary, can_view_records, guardians(id, full_name, phone, email, user_id)").eq("student_id", id).order("is_primary", { ascending: false }).returns<GuardianLink[]>(),
    supabase.from("student_status_history").select("id, from_status, to_status, from_class_id, to_class_id, reason, effective_on").eq("student_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("subject_registrations").select("subject_id").eq("student_id", id),
    supabase.from("attendance").select("status").eq("student_id", id).gte("attendance_date", new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)),
  ]);
  const registered = new Set((regs ?? []).map((r) => r.subject_id));
  const att = { present: 0, late: 0, absent: 0, excused: 0 } as Record<string, number>;
  for (const a of attendance ?? []) att[a.status] = (att[a.status] ?? 0) + 1;
  const attTotal = Object.values(att).reduce((x, y) => x + y, 0);

  return (
    <>
      <Link href="/school/students" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Students</Link>
      <PageHeader
        title={fullName(s)}
        description={`${s.student_number} · ${labelFrom(l.classes, s.class_id)} · ${s.residency === "boarding" ? "Boarding" : "Day"}`}
        actions={
          <>
            {(school.permissions.has("parents.message") || school.permissions.has("classroom.teach")) && <Link href={`/school/messages?student=${s.id}`} className={buttonClass("secondary", "sm")}>Message family</Link>}
            <Badge tone={s.status === "active" ? "success" : "neutral"}>{STUDENT_STATUSES.find((x) => x.value === s.status)?.label}</Badge>
          </>
        }
      />
      {created && <Alert tone="success" className="mb-6" title="Student admitted">Add a parent or guardian and register subjects below.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Student details" />
            <CardBody>
              {canManage ? (
                <StudentForm
                  classes={l.classes}
                  programmes={l.programmes}
                  houses={l.houses}
                  initial={{
                    id: s.id, studentNumber: s.student_number, firstName: s.first_name, middleName: s.middle_name, lastName: s.last_name, gender: s.gender,
                    dateOfBirth: s.date_of_birth, admissionDate: s.admission_date, programmeId: s.programme_id, classId: s.class_id, houseId: s.house_id,
                    residency: s.residency, previousSchool: s.previous_school,
                  }}
                />
              ) : (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["Gender", s.gender === "female" ? "Female" : "Male"],
                    ["Date of birth", formatDate(s.date_of_birth)],
                    ["Admitted", formatDate(s.admission_date)],
                    ["Programme", labelFrom(l.programmes, s.programme_id)],
                    ["House", labelFrom(l.houses, s.house_id)],
                    ["Previous school", s.previous_school ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Registered subjects" description="Core and elective subjects this student takes." />
            <CardBody>
              {l.subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subjects set up yet. Add them under Academic setup.</p>
              ) : (
                <form action={saveSubjects} className="space-y-4">
                  <input type="hidden" name="studentId" value={s.id} />
                  <fieldset disabled={!canManage} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <legend className="sr-only">Subjects</legend>
                    {l.subjects.map((sub) => (
                      <label key={sub.value} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                        <input type="checkbox" name="subjects" value={sub.value} defaultChecked={registered.has(sub.value)} className="h-4 w-4 accent-[var(--royal)]" />
                        {sub.label}
                      </label>
                    ))}
                  </fieldset>
                  {canManage && <SubmitButton size="sm" variant="secondary">Save subjects</SubmitButton>}
                </form>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" description="Admissions, class moves, transfers and graduation." />
            {!history?.length ? (
              <EmptyState title="No status changes yet" />
            ) : (
              <ul className="divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <p>
                      <span className="capitalize">{h.from_status ?? "—"}</span> → <span className="font-medium capitalize">{h.to_status}</span>
                      {h.to_class_id && h.to_class_id !== h.from_class_id && <span className="text-muted-foreground"> · to {labelFrom(l.classes, h.to_class_id)}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.effective_on)}{h.reason ? ` · ${h.reason}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Attendance (last 90 days)" />
            <CardBody>
              {attTotal === 0 ? (
                <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {(["present", "late", "absent", "excused"] as const).map((k) => (
                    <div key={k} className="rounded-md bg-surface-muted p-3"><dt className="capitalize text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{att[k]}</dd></div>
                  ))}
                  <p className="col-span-2 text-xs text-muted-foreground">Attendance rate {Math.round(((att.present + att.late) / attTotal) * 100)}% over {attTotal} school days recorded.</p>
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Parents & guardians" description="Linked guardians can view this student's records once they have an account." />
            <ul className="divide-y divide-border">
              {!guardians?.length && <li className="px-5 py-4 text-sm text-muted-foreground">No guardians recorded.</li>}
              {guardians?.map((g) => (
                <li key={g.id} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{g.guardians.full_name} {g.is_primary && <Badge tone="info" className="ml-1">Primary</Badge>}</p>
                      <p className="text-xs capitalize text-muted-foreground">{g.relationship} · {g.guardians.phone}</p>
                    </div>
                    {g.guardians.user_id ? (
                      <Badge tone={g.can_view_records ? "success" : "warning"}>{g.can_view_records ? "Portal access" : "Access paused"}</Badge>
                    ) : (
                      <Badge>No account</Badge>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      {!g.guardians.user_id && <LinkAccountForm kind="guardian" recordId={g.guardians.id} studentId={s.id} label="Guardian" />}
                      <form action={updateGuardianLink}>
                        <input type="hidden" name="linkId" value={g.id} />
                        <input type="hidden" name="studentId" value={s.id} />
                        <input type="hidden" name="op" value="toggle_view" />
                        <button type="submit" className={buttonClass("ghost", "sm")}>
                          {g.can_view_records ? <><ShieldOff className="h-3.5 w-3.5" /> Pause access</> : <><ShieldCheck className="h-3.5 w-3.5" /> Allow access</>}
                        </button>
                      </form>
                      <form action={updateGuardianLink}>
                        <input type="hidden" name="linkId" value={g.id} />
                        <input type="hidden" name="studentId" value={s.id} />
                        <input type="hidden" name="op" value="remove" />
                        <ConfirmSubmit title="Remove guardian?" description={`${g.guardians.full_name} will no longer be linked to this student.`} confirmLabel="Remove">Remove</ConfirmSubmit>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {canManage && (
              <CardBody className="border-t border-border">
                <GuardianForm studentId={s.id} />
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Student account" description="Links this record to the student's own sign-in for the student portal." />
            <CardBody className="text-sm">
              {s.user_id ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-accent"><Link2 className="h-4 w-4" /> Linked</span>
                  {canManage && (
                    <form action={unlinkAccount}>
                      <input type="hidden" name="kind" value="student" />
                      <input type="hidden" name="recordId" value={s.id} />
                      <input type="hidden" name="studentId" value={s.id} />
                      <ConfirmSubmit title="Unlink account?" description="The student will no longer see this record when signed in." confirmLabel="Unlink">Unlink</ConfirmSubmit>
                    </form>
                  )}
                </div>
              ) : canManage ? (
                <LinkAccountForm kind="student" recordId={s.id} studentId={s.id} label="Student" />
              ) : (
                <p className="text-muted-foreground">Not linked.</p>
              )}
            </CardBody>
          </Card>

          {canManage && (
            <Card>
              <CardHeader title="Change status" description="Transfers, withdrawals, suspensions, reinstatement and class moves." />
              <CardBody><StatusForm studentId={s.id} current={s.status} classes={l.classes} /></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
