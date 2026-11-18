import { BarChart3, Download, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { ordinal } from "@/lib/results/compute";
import { loadClassResults } from "@/lib/results/load";
import { myTaughtClasses, pick, schoolLookups } from "@/lib/school/lookups";
import { cn, formatDate } from "@/lib/utils";

import { setPublication } from "./actions";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ term?: string; class?: string }> }) {
  const { session, school } = await requireSchool();
  const p = school.permissions;
  const fullAccess = p.has("results.read") || p.has("assessments.manage");
  if (!fullAccess && !p.has("assessments.record")) redirect("/school?denied=1");
  const params = await searchParams;
  const l = await schoolLookups(school.schoolId);
  const taught = fullAccess ? null : await myTaughtClasses(school.schoolId, session.userId);
  const classes = fullAccess ? l.classes : l.classes.filter((c) => taught!.assignments.some((a) => a.class_id === c.value));
  const termId = pick(l.terms, params.term, l.terms.find((t) => t.isCurrent)?.value);
  const classId = pick(classes, params.class);

  if (!termId || !classId) {
    return (
      <>
        <PageHeader title="Results" />
        <Card><EmptyState icon={BarChart3} title="Nothing to show yet">Results appear once terms, classes and assessments exist.</EmptyState></Card>
      </>
    );
  }

  const r = await loadClassResults(school.schoolId, termId, classId);
  const canPublish = p.has("results.publish") && school.schoolStatus === "active";
  const qs = `term=${termId}&class=${classId}`;

  return (
    <>
      <PageHeader
        title="Results"
        description={`Term scores combine each subject's assessments by weight and are graded with ${r.scheme ? `“${r.scheme.name}”` : "your school's scheme"}.${fullAccess ? "" : " You see the subjects you teach."}`}
        actions={
          <>
            {p.has("assessments.manage") && <Link href="/school/results/grading" className={buttonClass("secondary")}><Settings2 className="h-4 w-4" /> Grading scheme</Link>}
            <a href={`/school/results/export?${qs}`} className={buttonClass("secondary")}><Download className="h-4 w-4" /> CSV</a>
          </>
        }
      />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select name="term" defaultValue={termId} aria-label="Term" className="sm:w-56">
          {l.terms.map((t) => <option key={t.value} value={t.value}>{t.label}{t.isCurrent ? " (current)" : ""}</option>)}
        </Select>
        <Select name="class" defaultValue={classId} aria-label="Class" className="sm:w-48">
          {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Show</button>
      </form>

      {!r.scheme?.hasBands && (
        <Alert tone="warning" className="mb-4" title="No grading scheme">
          Totals are calculated but not graded. {p.has("assessments.manage") ? <Link href="/school/results/grading" className="font-medium underline">Set up your grade bands</Link> : "Ask an examination officer to set up grade bands."}
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <span>
          {r.publishedAt ? <><Badge tone="success">Published</Badge> <span className="ml-2 text-muted-foreground">Visible to students and linked parents since {formatDate(r.publishedAt)}</span></> : <><Badge>Not published</Badge> <span className="ml-2 text-muted-foreground">Only staff can see these results.</span></>}
        </span>
        {canPublish && (
          <form action={setPublication}>
            <input type="hidden" name="termId" value={termId} />
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="publish" value={r.publishedAt ? "0" : "1"} />
            <ConfirmSubmit
              variant={r.publishedAt ? "danger" : "primary"}
              title={r.publishedAt ? "Withdraw results?" : "Publish results?"}
              description={r.publishedAt ? "Students and parents will no longer see these results." : "Students in this class and their linked parents will be able to see these scores. Check them first — later score changes appear immediately."}
              confirmLabel={r.publishedAt ? "Withdraw" : "Publish"}
            >
              {r.publishedAt ? "Withdraw" : "Publish results"}
            </ConfirmSubmit>
          </form>
        )}
      </div>

      <Card className="overflow-hidden">
        {r.assessmentCount === 0 || r.students.length === 0 ? (
          <EmptyState icon={BarChart3} title={r.students.length ? "No assessments for this term yet" : "No students in this class"}>
            {r.students.length ? <Link href="/school/assessments" className="font-medium text-royal hover:underline">Create an assessment</Link> : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-10 border-b border-border bg-surface-muted px-4 py-2.5">Student</th>
                  {r.subjects.map((s) => <th key={s.id} className="whitespace-nowrap border-b border-border px-3 py-2.5 text-right">{s.name}</th>)}
                  <th className="border-b border-border px-3 py-2.5 text-right">Average</th>
                  <th className="border-b border-border px-3 py-2.5 text-right">Position</th>
                </tr>
              </thead>
              <tbody>
                {r.students.map((s) => {
                  const res = r.results.get(s.id);
                  return (
                    <tr key={s.id} className="hover:bg-surface-muted/50">
                      <td className="sticky left-0 border-b border-border bg-surface px-4 py-2.5">
                        <Link href={`/school/students/${s.id}`} className="font-medium hover:text-royal hover:underline">{s.name}</Link>
                        <p className="text-xs text-muted-foreground">{s.number}</p>
                      </td>
                      {r.subjects.map((sub) => {
                        const x = res?.subjects[sub.id];
                        return (
                          <td key={sub.id} className={cn("whitespace-nowrap border-b border-border px-3 py-2.5 text-right tabular-nums", x?.incomplete && "text-warning")} title={x?.incomplete ? "Some assessments have no score yet" : undefined}>
                            {x?.total != null ? <>{x.total.toFixed(1)} {x.grade && <span className="ml-1 font-semibold">{x.grade}</span>}</> : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="border-b border-border px-3 py-2.5 text-right font-medium tabular-nums">{res?.average?.toFixed(1) ?? "—"}</td>
                      <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">{res?.position ? ordinal(res.position) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Amber totals are incomplete — at least one assessment has no score for that student and is left out of their total.</p>
    </>
  );
}
