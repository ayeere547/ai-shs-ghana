import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { computeResults, type Band } from "@/lib/results/compute";
import { requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Results" };

type Row = { subject_id: string; subject_name: string; assessment_name: string; kind: string; max_score: number; weight: number; score: number | null };

export default async function StudentResults({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const { student, school } = await requireEnrolledStudent();
  const supabase = await createClient();
  const { data: termsData } = await supabase.rpc("student_published_terms", { p_student: student.id });
  const terms = (termsData ?? []) as { term_id: string; term_name: string; year_name: string; published_at: string }[];
  const wanted = (await searchParams).term;
  const term = terms.find((t) => t.term_id === wanted) ?? terms[0];

  if (!term) return (<><PageHeader title="Results" /><Card><EmptyState icon={BarChart3} title="No results published yet">Your school publishes term results when they&apos;re ready.</EmptyState></Card></>);

  const [{ data: rowsData }, { data: scheme }] = await Promise.all([
    supabase.rpc("student_term_results", { p_student: student.id, p_term: term.term_id }),
    supabase.from("grading_schemes").select("grading_bands(grade, min_score, max_score, remark)").eq("school_id", school.schoolId).eq("is_default", true).maybeSingle<{ grading_bands: Band[] }>(),
  ]);
  const rows = (rowsData ?? []) as Row[];
  const subjects = [...new Map(rows.map((r) => [r.subject_id, r.subject_name])).entries()];
  const [mine] = computeResults({
    studentIds: [student.id],
    assessments: rows.map((r, i) => ({ id: String(i), subject_id: r.subject_id, max_score: Number(r.max_score), weight: Number(r.weight) })),
    scores: rows.map((r, i) => ({ assessment_id: String(i), student_id: student.id, score: r.score == null ? null : Number(r.score) })),
    bands: scheme?.grading_bands ?? [],
  });

  return (
    <>
      <PageHeader title="Results" description={`${term.year_name} ${term.term_name} · published ${formatDate(term.published_at)}`} />
      {terms.length > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Terms">
          {terms.map((t) => <Link key={t.term_id} href={`/student/results?term=${t.term_id}`} className={cn("rounded-full border px-3 py-1 text-sm", t.term_id === term.term_id ? "border-royal bg-royal-soft font-medium text-royal" : "border-border text-muted-foreground")}>{t.year_name} {t.term_name}</Link>)}
        </nav>
      )}
      <Card className="mb-6">
        <CardHeader title={`Average ${mine?.average?.toFixed(1) ?? "—"}%`} description="Each subject's score combines its assessments by the weights your teachers set." />
        <Table>
          <thead><tr><Th>Subject</Th><Th className="text-right">Score</Th><Th>Grade</Th><Th className="hidden sm:table-cell">Remark</Th></tr></thead>
          <tbody>
            {subjects.map(([sid, name]) => {
              const r = mine?.subjects[sid];
              return (
                <tr key={sid}>
                  <Td className="font-medium">{name}</Td>
                  <Td className="text-right tabular-nums">{r?.total != null ? `${r.total.toFixed(1)}%` : "—"}</Td>
                  <Td className="font-semibold">{r?.grade ?? "—"}</Td>
                  <Td className="hidden text-muted-foreground sm:table-cell">{r?.remark ?? ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Assessment breakdown" />
        <Table>
          <thead><tr><Th>Subject</Th><Th>Assessment</Th><Th className="text-right">Score</Th><Th className="text-right">Weight</Th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <Td className="text-muted-foreground">{r.subject_name}</Td>
                <Td>{r.assessment_name}</Td>
                <Td className="text-right tabular-nums">{r.score == null ? "—" : `${Number(r.score)} / ${Number(r.max_score)}`}</Td>
                <Td className="text-right tabular-nums text-muted-foreground">{Number(r.weight)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
