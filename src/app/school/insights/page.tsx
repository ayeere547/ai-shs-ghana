import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InsightSummaryButton } from "@/components/ai/tools";
import { buttonClass } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { myTaughtClasses, pick, schoolLookups } from "@/lib/school/lookups";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Learning insights" };

type Insights = {
  students: { student_id: string; name: string; average: number | null; attendance_rate: number | null; missing_assignments: number; weakest_subject: string | null; flags: string[] }[];
  subjects: { subject: string; class_average: number; below_50: number; students: number }[];
  topics: { topic: string; subject: string; success_rate: number; answers: number }[];
  class_attendance_rate: number | null;
};
const FLAG: Record<string, string> = { low_average: "Average below 50%", low_attendance: "Attendance below 80%", missing_work: "3+ missed assignments" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ class?: string; term?: string }> }) {
  const { session, school } = await requireSchool();
  const p = school.permissions;
  const all = p.has("results.read") || p.has("assessments.manage");
  if (!all && !p.has("assessments.record")) redirect("/school?denied=1");
  const params = await searchParams;
  const l = await schoolLookups(school.schoolId);
  const taught = all ? null : await myTaughtClasses(school.schoolId, session.userId);
  const classes = all ? l.classes : l.classes.filter((c) => taught!.assignments.some((a) => a.class_id === c.value));
  const classId = pick(classes, params.class);
  const termId = pick(l.terms, params.term, l.terms.find((t) => t.isCurrent)?.value);
  if (!classId || !termId) return (<><PageHeader title="Learning insights" /><Card><EmptyState icon={BarChart3} title="No classes to show" /></Card></>);

  const supabase = await createClient();
  const { data } = await supabase.rpc("class_insights", { p_class: classId, p_term: termId });
  const d = data as Insights | null;
  const flagged = (d?.students ?? []).filter((s) => s.flags.length);

  return (
    <>
      <PageHeader title="Learning insights" description="Patterns in results, attendance and coursework to help you decide who needs support. These indicators inform your judgement — they never make decisions about students." />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select name="class" defaultValue={classId} aria-label="Class" className="sm:w-48">{classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
        <Select name="term" defaultValue={termId} aria-label="Term" className="sm:w-56">{l.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
        <button type="submit" className={buttonClass("secondary")}>Show</button>
      </form>
      {!d ? <Alert tone="warning">Insights aren&apos;t available for this class.</Alert> : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title={`Students who may need support (${flagged.length})`} description={d.class_attendance_rate != null ? `Class attendance this term: ${d.class_attendance_rate}%` : undefined} />
            {!flagged.length ? <EmptyState title="No one is flagged right now" /> : (
              <Table>
                <thead><tr><Th>Student</Th><Th className="text-right">Average</Th><Th className="text-right">Attendance</Th><Th>Indicators</Th></tr></thead>
                <tbody>
                  {flagged.map((s) => (
                    <tr key={s.student_id}>
                      <Td><Link href={`/school/students/${s.student_id}`} className="font-medium hover:text-royal hover:underline">{s.name}</Link>{s.weakest_subject && <p className="text-xs text-muted-foreground">Weakest: {s.weakest_subject}</p>}</Td>
                      <Td className="text-right tabular-nums">{s.average ?? "—"}{s.average != null && "%"}</Td>
                      <Td className="text-right tabular-nums">{s.attendance_rate ?? "—"}{s.attendance_rate != null && "%"}</Td>
                      <Td><div className="flex flex-wrap gap-1">{s.flags.map((f) => <Badge key={f} tone="warning">{FLAG[f] ?? f}</Badge>)}</div></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <div className="space-y-6">
            {p.has("ai.teacher_tools") && <Card><CardHeader title="AI summary" /><CardBody><InsightSummaryButton classId={classId} termId={termId} /></CardBody></Card>}
            <Card>
              <CardHeader title="Subjects" description="Class averages, weakest first" />
              <ul className="divide-y divide-border">
                {d.subjects.map((s) => <li key={s.subject} className="flex justify-between gap-2 px-5 py-2 text-sm"><span>{s.subject}</span><span className="tabular-nums text-muted-foreground">{s.class_average}% · {s.below_50}/{s.students} below 50</span></li>)}
                {!d.subjects.length && <li className="px-5 py-3 text-sm text-muted-foreground">No assessment results this term.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Topics needing reteaching" description="From online exam answers (questions tagged with a topic)" />
              <ul className="divide-y divide-border">
                {d.topics.slice(0, 8).map((t) => <li key={`${t.subject}-${t.topic}`} className="flex justify-between gap-2 px-5 py-2 text-sm"><span>{t.topic} <span className="text-xs text-muted-foreground">· {t.subject}</span></span><span className="tabular-nums text-muted-foreground">{t.success_rate}%</span></li>)}
                {!d.topics.length && <li className="px-5 py-3 text-sm text-muted-foreground">Tag questions with topics to see this.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
