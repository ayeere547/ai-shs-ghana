import { Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ExamCreateForm } from "@/components/exams/forms";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { EXAM_KINDS, examState } from "@/lib/exams/questions";
import { schoolLookups } from "@/lib/school/lookups";
import { createClient } from "@/lib/supabase/server";
import { pickPair, teachingPairs } from "@/lib/teaching";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Online exams" };

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ pair?: string }> }) {
  const { session, school } = await requireSchool();
  if (!(school.permissions.has("classroom.teach") || school.permissions.has("classroom.manage"))) redirect("/school?denied=1");
  const [pairs, l] = await Promise.all([teachingPairs(school, session.userId), schoolLookups(school.schoolId)]);
  const pair = pickPair(pairs, (await searchParams).pair);
  if (!pair) return (<><PageHeader title="Online exams" /><Card><EmptyState icon={Timer} title="No classes to teach yet" /></Card></>);

  const supabase = await createClient();
  const { data } = await supabase.from("exams").select("id, title, kind, opens_at, closes_at, duration_minutes, is_published, results_released, exam_attempts(status)").eq("class_id", pair.classId).eq("subject_id", pair.subjectId).order("opens_at", { ascending: false })
    .returns<{ id: string; title: string; kind: string; opens_at: string; closes_at: string; duration_minutes: number; is_published: boolean; results_released: boolean; exam_attempts: { status: string }[] }[]>();

  return (
    <>
      <PageHeader title="Online exams" description={`${pair.className} · ${pair.subjectName} — timed papers with automatic marking of objective questions.`} />
      <form className="mb-4 flex gap-3">
        <Select name="pair" defaultValue={pair.key} aria-label="Class and subject" className="sm:w-72">{pairs.map((p) => <option key={p.key} value={p.key}>{p.className} · {p.subjectName}</option>)}</Select>
        <button type="submit" className={buttonClass("secondary")}>Open</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          {!data?.length ? (
            <EmptyState icon={Timer} title="No exams yet">Create one, add questions from the bank, then publish it.</EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Exam</Th><Th>Window</Th><Th>Scripts</Th><Th>Status</Th></tr></thead>
              <tbody>
                {data.map((e) => {
                  const st = examState(e);
                  const toMark = e.exam_attempts.filter((a) => a.status === "submitted").length;
                  return (
                    <tr key={e.id} className="hover:bg-surface-muted/60">
                      <Td><Link href={`/school/exams/${e.id}`} className="font-medium hover:text-royal hover:underline">{e.title}</Link><p className="text-xs text-muted-foreground">{EXAM_KINDS.find((k) => k.value === e.kind)?.label} · {e.duration_minutes} min</p></Td>
                      <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(e.opens_at, { dateStyle: "medium", timeStyle: "short" })}<br />to {formatDate(e.closes_at, { dateStyle: "medium", timeStyle: "short" })}</Td>
                      <Td className="tabular-nums">{e.exam_attempts.length}{toMark > 0 && <Badge tone="warning" className="ml-2">{toMark} to mark</Badge>}</Td>
                      <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        {school.schoolStatus === "active" && (
          <Card className="self-start">
            <CardHeader title="New exam" />
            <CardBody><ExamCreateForm classId={pair.classId} subjectId={pair.subjectId} terms={l.terms} defaultTerm={l.terms.find((t) => t.isCurrent)?.value} /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
