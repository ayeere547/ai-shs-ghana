import { FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AssessmentForm } from "@/components/assessments/forms";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { kindLabel } from "@/lib/assessments/kinds";
import { assessablePairs } from "@/lib/assessments/pairs";
import { requireSchool } from "@/lib/auth/session";
import { labelFrom, pick, schoolLookups } from "@/lib/school/lookups";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Assessments" };

type Row = { id: string; name: string; kind: string; class_id: string; subject_id: string; max_score: number; weight: number; assessed_on: string | null };

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ term?: string; class?: string }> }) {
  const { session, school } = await requireSchool();
  const p = school.permissions;
  if (!(p.has("assessments.record") || p.has("assessments.manage"))) redirect("/school?denied=1");
  const params = await searchParams;
  const [l, pairs] = await Promise.all([schoolLookups(school.schoolId), assessablePairs(school, session.userId)]);
  const termId = pick(l.terms, params.term, l.terms.find((t) => t.isCurrent)?.value);
  const classes = [...new Map(pairs.map((x) => [x.classId, x.className])).entries()].map(([value, label]) => ({ value, label }));
  const classId = classes.some((c) => c.value === params.class) ? params.class : undefined;

  const supabase = await createClient();
  let query = supabase.from("assessments").select("id, name, kind, class_id, subject_id, max_score, weight, assessed_on").eq("school_id", school.schoolId);
  if (termId) query = query.eq("term_id", termId);
  if (classId) query = query.eq("class_id", classId);
  const [{ data }, { data: counts }] = await Promise.all([
    query.order("created_at", { ascending: false }).limit(200).returns<Row[]>(),
    supabase.from("assessment_scores").select("assessment_id").eq("school_id", school.schoolId).not("score", "is", null).limit(20000),
  ]);
  const entered = new Map<string, number>();
  for (const c of counts ?? []) entered.set(c.assessment_id, (entered.get(c.assessment_id) ?? 0) + 1);
  const canWrite = school.schoolStatus === "active" && pairs.length > 0 && Boolean(termId);

  return (
    <>
      <PageHeader title="Assessments" description="Class tests, assignments and examinations. Teachers see and mark only the subjects they teach." />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select name="term" defaultValue={termId ?? ""} aria-label="Term" className="sm:w-56">
          {l.terms.map((t) => <option key={t.value} value={t.value}>{t.label}{t.isCurrent ? " (current)" : ""}</option>)}
        </Select>
        <Select name="class" defaultValue={classId ?? ""} aria-label="Class" className="sm:w-48">
          <option value="">All my classes</option>
          {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Filter</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          {!data?.length ? (
            <EmptyState icon={FileCheck2} title="No assessments yet">
              {pairs.length ? "Create one with the form." : "You have no teaching assignments. Ask an administrator to add them."}
            </EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Assessment</Th><Th>Class · Subject</Th><Th className="hidden md:table-cell">Out of / weight</Th><Th>Scores</Th></tr></thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-muted/60">
                    <Td>
                      <Link href={`/school/assessments/${a.id}`} className="font-medium hover:text-royal hover:underline">{a.name}</Link>
                      <p className="text-xs text-muted-foreground">{kindLabel(a.kind)}{a.assessed_on ? ` · ${formatDate(a.assessed_on)}` : ""}</p>
                    </Td>
                    <Td className="text-muted-foreground">{labelFrom(l.classes, a.class_id)} · {labelFrom(l.subjects, a.subject_id)}</Td>
                    <Td className="hidden tabular-nums text-muted-foreground md:table-cell">{Number(a.max_score)} / {Number(a.weight)}</Td>
                    <Td className="tabular-nums">{entered.get(a.id) ?? 0}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {canWrite && (
          <Card className="self-start">
            <CardHeader title="New assessment" description="Weights are relative: a subject's term score combines its assessments in proportion to their weights." />
            <CardBody><AssessmentForm terms={l.terms} pairs={pairs} defaultTerm={termId} /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
