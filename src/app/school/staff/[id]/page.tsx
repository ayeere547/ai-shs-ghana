import { ArrowLeft, CalendarDays, Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { removeAssignment, unlinkStaffAccount } from "@/app/school/staff/actions";
import { AssignmentForm, StaffForm, StaffLinkForm } from "@/components/staff/forms";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, staffName } from "@/lib/staff/schema";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff member" };

type Staff = {
  id: string; staff_number: string; title: string | null; first_name: string; last_name: string; gender: string | null; email: string | null; phone: string | null;
  job_title: string; department_id: string | null; is_teaching: boolean; employment_type: string; employment_status: string; date_joined: string | null; user_id: string | null;
};

export default async function StaffMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { school } = await requireSchoolPermission("staff.read");
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: s } = await supabase.from("staff").select("*").eq("id", id).eq("school_id", school.schoolId).maybeSingle<Staff>();
  if (!s) notFound();
  const canManage = school.permissions.has("staff.manage") && school.schoolStatus === "active";
  const [l, { data: assignments }] = await Promise.all([
    schoolLookups(school.schoolId),
    supabase.from("teacher_assignments").select("id, class_id, subject_id, periods_per_week").eq("staff_id", id),
  ]);
  const load = (assignments ?? []).reduce((n, a) => n + a.periods_per_week, 0);

  return (
    <>
      <Link href="/school/staff" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Staff</Link>
      <PageHeader
        title={staffName(s)}
        description={`${s.staff_number} · ${s.job_title} · ${labelFrom(l.departments, s.department_id)}`}
        actions={<Badge tone={s.employment_status === "active" ? "success" : "neutral"}>{EMPLOYMENT_STATUSES.find((x) => x.value === s.employment_status)?.label}</Badge>}
      />
      {created && <Alert tone="success" className="mb-6" title="Staff member added">Add their teaching assignments and link their sign-in account below.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Teaching assignments" description={`${assignments?.length ?? 0} classes · ${load} periods per week. Assignments decide which classes this teacher can take attendance and enter scores for.`} action={<Link href={`/school/timetable?staff=${s.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-royal hover:underline"><CalendarDays className="h-4 w-4" /> Timetable</Link>} />
            {!assignments?.length ? (
              <EmptyState title="No assignments yet">{s.is_teaching ? "Add the classes and subjects this teacher takes." : "Non-teaching staff usually have no assignments."}</EmptyState>
            ) : (
              <Table>
                <thead><tr><Th>Class</Th><Th>Subject</Th><Th>Periods / week</Th>{canManage && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <Td className="font-medium">{labelFrom(l.classes, a.class_id)}</Td>
                      <Td>{labelFrom(l.subjects, a.subject_id)}</Td>
                      <Td className="tabular-nums">{a.periods_per_week}</Td>
                      {canManage && (
                        <Td className="text-right">
                          <form action={removeAssignment}>
                            <input type="hidden" name="assignmentId" value={a.id} />
                            <input type="hidden" name="staffId" value={s.id} />
                            <ConfirmSubmit title="Remove assignment?" description="The teacher loses access to this class's attendance and scores for the subject. Existing records are kept." confirmLabel="Remove">Remove</ConfirmSubmit>
                          </form>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {canManage && <CardBody className="border-t border-border"><AssignmentForm staffId={s.id} classes={l.classes} subjects={l.subjects} /></CardBody>}
          </Card>
          <Card>
            <CardHeader title="Staff details" />
            <CardBody>
              {canManage ? (
                <StaffForm
                  departments={l.departments}
                  initial={{
                    id: s.id, staffNumber: s.staff_number, title: s.title, firstName: s.first_name, lastName: s.last_name, gender: s.gender, email: s.email, phone: s.phone,
                    jobTitle: s.job_title, departmentId: s.department_id, isTeaching: s.is_teaching, employmentType: s.employment_type, employmentStatus: s.employment_status, dateJoined: s.date_joined,
                  }}
                />
              ) : (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["Email", s.email ?? "—"], ["Phone", s.phone ?? "—"],
                    ["Employment", EMPLOYMENT_TYPES.find((t) => t.value === s.employment_type)?.label ?? "—"], ["Joined", formatDate(s.date_joined)],
                  ].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
                </dl>
              )}
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Sign-in account" description="Link the account this person uses, so their assignments apply when they sign in." />
          <CardBody className="text-sm">
            {s.user_id ? (
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-accent"><Link2 className="h-4 w-4" /> Linked</span>
                {canManage && (
                  <form action={unlinkStaffAccount}>
                    <input type="hidden" name="staffId" value={s.id} />
                    <ConfirmSubmit title="Unlink account?" description="Their teaching assignments will no longer apply to their sign-in." confirmLabel="Unlink">Unlink</ConfirmSubmit>
                  </form>
                )}
              </div>
            ) : canManage ? (
              <StaffLinkForm staffId={s.id} />
            ) : (
              <p className="text-muted-foreground">Not linked.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
