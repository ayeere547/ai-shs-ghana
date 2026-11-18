import { Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { EXAM_KINDS, examState } from "@/lib/exams/questions";
import { requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Exams & practice" };

export default async function StudentExams() {
  const { student } = await requireEnrolledStudent();
  const supabase = await createClient();
  const [{ data: exams }, { data: attempts }] = await Promise.all([
    supabase.from("exams").select("id, title, kind, opens_at, closes_at, duration_minutes, is_published, results_released, school_subjects(name)").eq("class_id", student.class_id).order("opens_at", { ascending: false }).limit(100)
      .returns<{ id: string; title: string; kind: string; opens_at: string; closes_at: string; duration_minutes: number; is_published: boolean; results_released: boolean; school_subjects: { name: string } }[]>(),
    supabase.from("exam_attempts").select("exam_id, status, total_score, max_score").eq("student_id", student.id),
  ]);
  const mine = new Map((attempts ?? []).map((a) => [a.exam_id, a]));
  return (
    <>
      <PageHeader title="Exams & practice" description="Online tests, mock exams and WASSCE practice set by your teachers." />
      <Card>
        {!exams?.length ? (
          <EmptyState icon={Timer} title="No exams yet" />
        ) : (
          <ul className="divide-y divide-border">
            {exams.map((e) => {
              const a = mine.get(e.id);
              const st = examState(e);
              return (
                <li key={e.id}>
                  <Link href={`/student/exams/${e.id}`} className="flex flex-col gap-1 px-5 py-3 text-sm hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between">
                    <span><span className="font-medium">{e.title}</span><span className="block text-xs text-muted-foreground">{e.school_subjects.name} · {EXAM_KINDS.find((k) => k.value === e.kind)?.label} · {e.duration_minutes} min · {formatDate(e.opens_at, { dateStyle: "medium", timeStyle: "short" })}</span></span>
                    {e.results_released && a ? <Badge tone="success">{Number(a.total_score)} / {Number(a.max_score)}</Badge> : a && a.status !== "in_progress" ? <Badge tone="info">Submitted</Badge> : a ? <Badge tone="warning">In progress</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
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
