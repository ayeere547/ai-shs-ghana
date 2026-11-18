import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AssignmentCreateForm } from "@/components/assignments/forms";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { pickPair, teachingPairs } from "@/lib/teaching";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ pair?: string }> }) {
  const { session, school } = await requireSchool();
  if (!(school.permissions.has("classroom.teach") || school.permissions.has("classroom.manage"))) redirect("/school?denied=1");
  const pairs = await teachingPairs(school, session.userId);
  const pair = pickPair(pairs, (await searchParams).pair);
  if (!pair) return (<><PageHeader title="Assignments" /><Card><EmptyState icon={NotebookPen} title="No classes to teach yet" /></Card></>);

  const supabase = await createClient();
  const [{ data: assignments }, { count: classSize }] = await Promise.all([
    supabase.from("assignments").select("id, title, due_at, max_score, allow_late, assignment_submissions(status)").eq("class_id", pair.classId).eq("subject_id", pair.subjectId).order("due_at", { ascending: false }).returns<{ id: string; title: string; due_at: string; max_score: number; allow_late: boolean; assignment_submissions: { status: string }[] }[]>(),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("class_id", pair.classId).eq("status", "active"),
  ]);
  const now = Date.now();

  return (
    <>
      <PageHeader title="Assignments" description={`${pair.className} · ${pair.subjectName}`} />
      <form className="mb-4 flex gap-3">
        <Select name="pair" defaultValue={pair.key} aria-label="Class and subject" className="sm:w-72">
          {pairs.map((p) => <option key={p.key} value={p.key}>{p.className} · {p.subjectName}</option>)}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Open</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          {!assignments?.length ? (
            <EmptyState icon={NotebookPen} title="No assignments yet">Set the first one with the form.</EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Assignment</Th><Th>Due</Th><Th>Submitted</Th><Th>To mark</Th></tr></thead>
              <tbody>
                {assignments.map((a) => {
                  const submitted = a.assignment_submissions.length;
                  const toMark = a.assignment_submissions.filter((s) => s.status === "submitted").length;
                  return (
                    <tr key={a.id} className="hover:bg-surface-muted/60">
                      <Td><Link href={`/school/assignments/${a.id}`} className="font-medium hover:text-royal hover:underline">{a.title}</Link></Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{formatDate(a.due_at, { dateStyle: "medium", timeStyle: "short" })} {Date.parse(a.due_at) < now && <Badge className="ml-1">Closed</Badge>}</Td>
                      <Td className="tabular-nums">{submitted} / {classSize ?? "—"}</Td>
                      <Td>{toMark > 0 ? <Badge tone="warning">{toMark}</Badge> : <span className="text-muted-foreground">—</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        {school.schoolStatus === "active" && (
          <Card className="self-start">
            <CardHeader title="New assignment" description="Students submit typed answers or a file (photo of written work, PDF or Word)." />
            <CardBody><AssignmentCreateForm classId={pair.classId} subjectId={pair.subjectId} /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
