import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReportCommentRow } from "@/components/ai/tools";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { myTaughtClasses, pick, schoolLookups } from "@/lib/school/lookups";
import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Report comments" };

export default async function ReportCommentsPage({ searchParams }: { searchParams: Promise<{ class?: string; term?: string }> }) {
  const { session, school } = await requireSchool();
  const p = school.permissions;
  const all = p.has("results.publish") || p.has("assessments.manage");
  if (!all && !p.has("assessments.record")) redirect("/school?denied=1");
  const params = await searchParams;
  const l = await schoolLookups(school.schoolId);
  const taught = all ? null : await myTaughtClasses(school.schoolId, session.userId);
  const classes = all ? l.classes : l.classes.filter((c) => taught!.assignments.some((a) => a.class_id === c.value));
  const classId = pick(classes, params.class);
  const termId = pick(l.terms, params.term, l.terms.find((t) => t.isCurrent)?.value);
  if (!classId || !termId) return (<><PageHeader title="Report comments" /><Card><EmptyState title="No classes to comment on" /></Card></>);

  const supabase = await createClient();
  const [{ data: students }, { data: mine }] = await Promise.all([
    supabase.from("students").select("id, first_name, middle_name, last_name").eq("class_id", classId).eq("status", "active").order("last_name"),
    supabase.from("report_comments").select("student_id, comment, status").eq("term_id", termId).eq("author_id", session.userId),
  ]);
  const byStudent = new Map((mine ?? []).map((c) => [c.student_id, c]));
  const canAi = p.has("ai.teacher_tools");

  return (
    <>
      <PageHeader title="Report comments" description="Write or draft end-of-term comments. AI drafts use the student's results and attendance (no names are sent) and are never shown to families until you approve them and the term's results are published." />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select name="class" defaultValue={classId} aria-label="Class" className="sm:w-48">{classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
        <Select name="term" defaultValue={termId} aria-label="Term" className="sm:w-56">{l.terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
        <button type="submit" className={buttonClass("secondary")}>Show</button>
      </form>
      <Card>
        <CardHeader title={`${byStudent.size} of ${students?.length ?? 0} written`} />
        <ul className="divide-y divide-border">
          {(students ?? []).map((s) => <ReportCommentRow key={s.id} studentId={s.id} termId={termId} name={fullName(s)} existing={byStudent.get(s.id) ?? null} canAi={canAi} />)}
        </ul>
      </Card>
    </>
  );
}
