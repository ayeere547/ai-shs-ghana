import { CalendarDays, NotebookPen, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnnouncementList, type Announcement } from "@/components/classroom/views";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { examState } from "@/lib/exams/questions";
import { getStudentContext } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES } from "@/lib/timetable/generate";
import { formatDate, todayInAccra } from "@/lib/utils";

export const metadata: Metadata = { title: "My learning" };

export default async function StudentHome() {
  const ctx = await getStudentContext();
  if (!ctx?.student?.class_id) {
    return (
      <>
        <PageHeader title="Welcome" />
        <Alert tone="info" title="Your student record isn't linked yet">
          Ask your school to link your sign-in to your student record. Once they do, your timetable, classroom and results appear here.
        </Alert>
      </>
    );
  }
  const { student, school } = ctx;
  const supabase = await createClient();
  const today = todayInAccra();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const { data: term } = await supabase.from("academic_terms").select("id").eq("school_id", school.schoolId).eq("is_current", true).maybeSingle();

  const [{ data: lessons }, { data: assignments }, { data: subs }, { data: exams }, { data: news }, { data: attendance }] = await Promise.all([
    term
      ? supabase.from("timetable_slots").select("room, timetable_periods(name, starts_at, ends_at), school_subjects(name)").eq("term_id", term.id).eq("class_id", student.class_id!).eq("day_of_week", dow)
          .returns<{ room: string | null; timetable_periods: { name: string; starts_at: string; ends_at: string }; school_subjects: { name: string } }[]>()
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("assignments").select("id, title, due_at, school_subjects(name)").eq("class_id", student.class_id!).gte("due_at", new Date().toISOString()).order("due_at").limit(8)
      .returns<{ id: string; title: string; due_at: string; school_subjects: { name: string } }[]>(),
    supabase.from("assignment_submissions").select("assignment_id").eq("student_id", student.id),
    supabase.from("exams").select("id, title, opens_at, closes_at, is_published, results_released, school_subjects(name)").eq("class_id", student.class_id!).gte("closes_at", new Date().toISOString()).order("opens_at").limit(5)
      .returns<{ id: string; title: string; opens_at: string; closes_at: string; is_published: boolean; results_released: boolean; school_subjects: { name: string } }[]>(),
    supabase.from("announcements").select("id, title, body, is_urgent, created_at, class_id, audience").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(5).returns<Announcement[]>(),
    supabase.from("attendance").select("status").eq("student_id", student.id).gte("attendance_date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
  ]);
  const submitted = new Set((subs ?? []).map((s) => s.assignment_id));
  const pending = (assignments ?? []).filter((a) => !submitted.has(a.id));
  const sorted = [...(lessons ?? [])].sort((a, b) => a.timetable_periods.starts_at.localeCompare(b.timetable_periods.starts_at));
  const att = attendance ?? [];
  const rate = att.length ? Math.round((att.filter((a) => a.status === "present" || a.status === "late").length / att.length) * 100) : null;

  return (
    <>
      <PageHeader title={`Hello, ${student.first_name}`} description={`${student.className ?? ""} · ${school.schoolName} · ${formatDate(today, { dateStyle: "full" })}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Today's lessons · ${DAY_NAMES[dow]}`} action={rate != null && <Badge tone={rate >= 90 ? "success" : rate >= 75 ? "warning" : "danger"}>Attendance {rate}% (30 days)</Badge>} />
          {!sorted.length ? (
            <EmptyState icon={CalendarDays} title="No lessons scheduled today" />
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((l, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{l.timetable_periods.starts_at.slice(0, 5)}–{l.timetable_periods.ends_at.slice(0, 5)}</span>
                  <span className="font-medium">{l.school_subjects.name}</span>
                  {l.room && <span className="text-muted-foreground">· {l.room}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Exams" action={<Link href="/student/exams" className="text-sm font-medium text-royal hover:underline">All</Link>} />
          {!exams?.length ? (
            <EmptyState icon={Timer} title="No upcoming exams" />
          ) : (
            <ul className="divide-y divide-border">
              {exams.map((e) => {
                const st = examState(e);
                return (
                  <li key={e.id}>
                    <Link href={`/student/exams/${e.id}`} className="block px-5 py-3 text-sm hover:bg-surface-muted">
                      <span className="flex items-center justify-between gap-2"><span className="font-medium">{e.title}</span><Badge tone={st.tone}>{st.label}</Badge></span>
                      <span className="text-xs text-muted-foreground">{e.school_subjects.name} · {formatDate(e.opens_at, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Assignments due" action={<Link href="/student/assignments" className="text-sm font-medium text-royal hover:underline">All</Link>} />
          {!pending.length ? (
            <EmptyState icon={NotebookPen} title="You're all caught up" />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((a) => (
                <li key={a.id}>
                  <Link href={`/student/assignments/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-muted">
                    <span><span className="font-medium">{a.title}</span><span className="block text-xs text-muted-foreground">{a.school_subjects.name}</span></span>
                    <Badge tone={Date.parse(a.due_at) - Date.now() < 2 * 864e5 ? "warning" : "neutral"}>Due {formatDate(a.due_at, { dateStyle: "medium", timeStyle: "short" })}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Announcements" />
          <AnnouncementList items={news ?? []} />
        </Card>
      </div>
      <Card className="mt-6">
        <CardBody className="text-sm text-muted-foreground">The AI tutor arrives in the next development phase. Until then, use the classroom discussion to ask your teacher and classmates.</CardBody>
      </Card>
    </>
  );
}
