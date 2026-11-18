import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Register } from "@/components/attendance/register";
import { buttonClass } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { labelFrom, myTaughtClasses, pick, schoolLookups } from "@/lib/school/lookups";
import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInAccra } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ class?: string; date?: string }> }) {
  const { session, school } = await requireSchool();
  const manage = school.permissions.has("attendance.manage");
  if (!manage && !school.permissions.has("attendance.record")) redirect("/school?denied=1");
  const params = await searchParams;
  const l = await schoolLookups(school.schoolId);

  // Managers see every class; teachers see only the classes they're assigned to.
  const taught = manage ? null : await myTaughtClasses(school.schoolId, session.userId);
  const classes = manage ? l.classes : l.classes.filter((c) => taught!.assignments.some((a) => a.class_id === c.value));
  const classId = pick(classes, params.class);
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= todayInAccra() ? params.date : todayInAccra();

  if (!classId) {
    return (
      <>
        <PageHeader title="Attendance" />
        <Card>
          <EmptyState icon={ClipboardCheck} title={manage ? "No classes yet" : "You have no classes assigned"}>
            {manage ? "Add classes under Academic setup." : "Ask an administrator to link your sign-in to your staff record and add your teaching assignments."}
          </EmptyState>
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: students }, { data: marks }, { data: week }] = await Promise.all([
    supabase.from("students").select("id, student_number, first_name, middle_name, last_name").eq("class_id", classId).in("status", ["active", "suspended"]).order("last_name").order("first_name"),
    supabase.from("attendance").select("student_id, status, remark").eq("class_id", classId).eq("attendance_date", date),
    supabase.from("attendance").select("attendance_date, status").eq("class_id", classId).gte("attendance_date", new Date(Date.parse(date) - 6 * 864e5).toISOString().slice(0, 10)).lte("attendance_date", date),
  ]);
  const byStudent = new Map((marks ?? []).map((m) => [m.student_id, m]));
  const days = new Map<string, { total: number; here: number }>();
  for (const w of week ?? []) {
    const d = days.get(w.attendance_date) ?? { total: 0, here: 0 };
    d.total++;
    if (w.status === "present" || w.status === "late") d.here++;
    days.set(w.attendance_date, d);
  }
  const canWrite = school.schoolStatus === "active";

  return (
    <>
      <PageHeader title="Attendance" description={`${labelFrom(l.classes, classId)} · ${formatDate(date, { dateStyle: "full" })}`} />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select name="class" defaultValue={classId} aria-label="Class" className="sm:w-56">
          {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Input name="date" type="date" defaultValue={date} max={todayInAccra()} aria-label="Date" className="sm:w-44" />
        <button type="submit" className={buttonClass("secondary")}>Open register</button>
      </form>
      {marks && marks.length > 0 && <Alert tone="info" className="mb-4">This register was already taken — saving again updates it.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <Card>
          <CardBody>
            {!students?.length ? (
              <EmptyState title="No students in this class" />
            ) : (
              <Register
                key={`${classId}-${date}`}
                classId={classId}
                date={date}
                readOnly={!canWrite}
                students={students.map((s) => ({ id: s.id, name: fullName(s), number: s.student_number, status: byStudent.get(s.id)?.status ?? null, remark: byStudent.get(s.id)?.remark ?? null }))}
              />
            )}
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Last 7 days" description="Share of students present or late" />
          <ul className="divide-y divide-border">
            {[...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([d, v]) => (
              <li key={d} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="text-muted-foreground">{formatDate(d, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="font-medium tabular-nums">{Math.round((v.here / v.total) * 100)}%</span>
              </li>
            ))}
            {days.size === 0 && <li className="px-5 py-3 text-sm text-muted-foreground">No registers taken this week.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
