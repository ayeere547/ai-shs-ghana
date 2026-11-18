import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Assignments" };

export default async function StudentAssignments() {
  const { student } = await requireEnrolledStudent();
  const supabase = await createClient();
  const [{ data: assignments }, { data: subs }] = await Promise.all([
    supabase.from("assignments").select("id, title, due_at, max_score, allow_late, school_subjects(name)").eq("class_id", student.class_id).order("due_at", { ascending: false }).limit(100)
      .returns<{ id: string; title: string; due_at: string; max_score: number; allow_late: boolean; school_subjects: { name: string } }[]>(),
    supabase.from("assignment_submissions").select("assignment_id, status, score").eq("student_id", student.id),
  ]);
  const mine = new Map((subs ?? []).map((s) => [s.assignment_id, s]));
  const now = Date.now();
  return (
    <>
      <PageHeader title="Assignments" description="Work set by your teachers." />
      <Card>
        {!assignments?.length ? (
          <EmptyState icon={NotebookPen} title="No assignments yet" />
        ) : (
          <ul className="divide-y divide-border">
            {assignments.map((a) => {
              const s = mine.get(a.id);
              const overdue = !s && Date.parse(a.due_at) < now;
              return (
                <li key={a.id}>
                  <Link href={`/student/assignments/${a.id}`} className="flex flex-col gap-1 px-5 py-3 text-sm hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between">
                    <span><span className="font-medium">{a.title}</span><span className="block text-xs text-muted-foreground">{a.school_subjects.name} · due {formatDate(a.due_at, { dateStyle: "medium", timeStyle: "short" })}</span></span>
                    {s?.status === "returned" ? <Badge tone="success">Marked · {Number(s.score)} / {Number(a.max_score)}</Badge> : s ? <Badge tone="info">Submitted</Badge> : overdue ? <Badge tone={a.allow_late ? "warning" : "danger"}>{a.allow_late ? "Late — still accepted" : "Missed"}</Badge> : <Badge>To do</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
