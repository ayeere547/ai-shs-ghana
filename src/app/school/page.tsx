import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Circle, GraduationCap, Layers, School, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/dashboard/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { canSchool, requireSchool } from "@/lib/auth/session";
import { onboardingSteps, progressPercent } from "@/lib/school/onboarding";
import { schoolCounts } from "@/lib/school/queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInAccra } from "@/lib/utils";

export const metadata: Metadata = { title: "School dashboard" };

export default async function SchoolDashboard({ searchParams }: { searchParams: Promise<{ registered?: string; denied?: string; launched?: string }> }) {
  const { school } = await requireSchool();
  const { registered, denied, launched } = await searchParams;
  const supabase = await createClient();
  const today = todayInAccra();
  const [c, { data: current }, { data: activity }, { data: todays }] = await Promise.all([
    schoolCounts(school.schoolId),
    supabase.from("academic_terms").select("name, starts_on, ends_on, academic_years(name)").eq("school_id", school.schoolId).eq("is_current", true).maybeSingle<{ name: string; starts_on: string; ends_on: string; academic_years: { name: string } | null }>(),
    canSchool(school, "school.audit.read")
      ? supabase.from("audit_logs").select("id, created_at, summary, action").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: null }),
    supabase.from("attendance").select("status").eq("school_id", school.schoolId).eq("attendance_date", today).limit(5000),
  ]);
  const attendanceToday: Record<string, number> = {};
  for (const a of todays ?? []) attendanceToday[a.status] = (attendanceToday[a.status] ?? 0) + 1;
  const attendanceTotal = (todays ?? []).length;
  const steps = onboardingSteps(c.onboarding);
  const showOnboarding = !c.onboarding.launched && canSchool(school, "school.settings.manage");

  return (
    <>
      <PageHeader
        title={school.schoolName}
        description={current ? `${current.academic_years?.name ?? ""} · ${current.name} (${formatDate(current.starts_on)} – ${formatDate(current.ends_on)})` : `Signed in as ${school.roleLabel}`}
      />
      {registered && (
        <Alert tone="success" className="mb-6" title="Registration submitted">
          Platform staff will verify your school&apos;s details. You&apos;ll get a notification when it&apos;s approved, then you can complete onboarding.
        </Alert>
      )}
      {launched && <Alert tone="success" className="mb-6" title="Your school is live">Staff you&apos;ve added can now sign in and use the school workspace.</Alert>}
      {denied && <Alert tone="warning" className="mb-6">You don&apos;t have permission for that page, or the school isn&apos;t active yet.</Alert>}

      {showOnboarding && (
        <Card className="mb-6">
          <CardHeader
            title="Finish setting up your school"
            description={`${progressPercent(steps)}% complete`}
            action={<ButtonLink href="/school/onboarding" size="sm">Continue setup <ArrowRight className="h-4 w-4" /></ButtonLink>}
          />
          <CardBody>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div className="h-full rounded-full bg-royal" style={{ width: `${progressPercent(steps)}%` }} />
            </div>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-label="Done" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not done" />}
                  <span className={s.done ? "text-muted-foreground" : ""}>{s.title}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Students" value={c.students} icon={UserRound} detail="active" href={canSchool(school, "students.read") ? "/school/students" : undefined} tone="primary" />
        <StatCard label="Staff accounts" value={c.staff} icon={Users} href={canSchool(school, "members.read") ? "/school/members" : undefined} />
        <StatCard label="Classes" value={c.classes} icon={School} href="/school/academics?tab=classes" />
        <StatCard label="Programmes" value={c.programmes} icon={Layers} href="/school/academics?tab=programmes" />
        <StatCard label="Subjects" value={c.subjects} icon={BookOpen} href="/school/academics?tab=subjects" />
        <StatCard label="Departments" value={c.departments} icon={GraduationCap} href="/school/academics?tab=departments" />
        <StatCard label="Academic years" value={c.years} icon={CalendarDays} href="/school/academics?tab=years" />
        <StatCard label="Houses" value={c.houses} icon={School} href="/school/academics?tab=houses" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Attendance today"
            description={formatDate(today, { dateStyle: "full" })}
            action={(canSchool(school, "attendance.record") || canSchool(school, "attendance.manage")) && <Link href="/school/attendance" className="text-sm font-medium text-royal hover:underline">Take attendance</Link>}
          />
          {attendanceTotal === 0 ? (
            <EmptyState icon={CalendarDays} title="No registers taken yet today">
              Teachers take attendance for their classes from the Attendance page. Assignments, examinations and the student portal follow in the next development phase.
            </EmptyState>
          ) : (
            <CardBody>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["present", "late", "absent", "excused"] as const).map((k) => (
                  <div key={k} className="rounded-md bg-surface-muted p-3">
                    <dt className="text-xs capitalize text-muted-foreground">{k}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{attendanceToday[k] ?? 0}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                {Math.round((((attendanceToday.present ?? 0) + (attendanceToday.late ?? 0)) / attendanceTotal) * 100)}% of {attendanceTotal} students marked so far are in school.
              </p>
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={activity && <Link href="/school/audit" className="text-sm font-medium text-royal hover:underline">All</Link>} />
          {!activity ? (
            <CardBody className="text-sm text-muted-foreground">Your role doesn&apos;t include the activity log.</CardBody>
          ) : activity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p>{a.summary ?? a.action}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(a.created_at, { dateStyle: "medium", timeStyle: "short" })}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
