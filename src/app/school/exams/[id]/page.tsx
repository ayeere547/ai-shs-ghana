import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addExamQuestions, examAction, removeExamQuestion } from "@/app/school/exams/actions";
import { RecordForm } from "@/components/exams/forms";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { examState, QUESTION_TYPES, sourceLabel } from "@/lib/exams/questions";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";


export const metadata: Metadata = { title: "Exam" };

type Exam = { id: string; title: string; kind: string; class_id: string; subject_id: string; term_id: string | null; instructions: string | null; duration_minutes: number; opens_at: string; closes_at: string; is_published: boolean; results_released: boolean };
type PaperRow = { id: string; position: number; marks: number; questions: { id: string; type: string; prompt: string; source: string } };
type Attempt = { id: string; student_id: string; status: string; started_at: string; submitted_at: string | null; deadline_at: string; total_score: number | null; max_score: number | null; students: { first_name: string; middle_name: string | null; last_name: string } };

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { school } = await requireSchool();
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from("exams").select("*").eq("id", id).eq("school_id", school.schoolId).maybeSingle<Exam>();
  if (!e) notFound();
  const { data: canRun } = await supabase.rpc("can_run_exam", { p_exam: id });
  if (!canRun) notFound();

  const [l, { data: paper }, { data: attempts }, { data: bank }] = await Promise.all([
    schoolLookups(school.schoolId),
    supabase.from("exam_questions").select("id, position, marks, questions(id, type, prompt, source)").eq("exam_id", id).order("position").returns<PaperRow[]>(),
    supabase.from("exam_attempts").select("id, student_id, status, started_at, submitted_at, deadline_at, total_score, max_score, students(first_name, middle_name, last_name)").eq("exam_id", id).order("started_at").returns<Attempt[]>(),
    supabase.from("questions").select("id, type, prompt, marks, source").eq("school_id", school.schoolId).eq("subject_id", e.subject_id).order("created_at", { ascending: false }).limit(300),
  ]);
  const onPaper = new Set((paper ?? []).map((p) => p.questions.id));
  const totalMarks = (paper ?? []).reduce((n, p) => n + Number(p.marks), 0);
  const locked = (attempts ?? []).length > 0;
  const writable = school.schoolStatus === "active";
  const st = examState(e);
  const now = Date.now();
  const expired = (attempts ?? []).filter((a) => a.status === "in_progress" && Date.parse(a.deadline_at) < now).length;
  const toMark = (attempts ?? []).filter((a) => a.status === "submitted").length;
  const allMarked = (attempts ?? []).length > 0 && (attempts ?? []).every((a) => a.status === "marked");

  return (
    <>
      <Link href={`/school/exams?pair=${e.class_id}:${e.subject_id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Online exams</Link>
      <PageHeader
        title={e.title}
        description={`${labelFrom(l.classes, e.class_id)} · ${labelFrom(l.subjects, e.subject_id)} · ${e.duration_minutes} minutes · open ${formatDate(e.opens_at, { dateStyle: "medium", timeStyle: "short" })} – ${formatDate(e.closes_at, { dateStyle: "medium", timeStyle: "short" })}`}
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {writable && (
        <div className="mb-6 flex flex-wrap gap-2">
          {!e.is_published ? (
            <form action={examAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="op" value="publish" /><SubmitButton>Publish to students</SubmitButton></form>
          ) : !locked && (
            <form action={examAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="op" value="unpublish" /><SubmitButton variant="secondary">Unpublish</SubmitButton></form>
          )}
          {expired > 0 && <form action={examAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="op" value="finalise" /><SubmitButton variant="secondary">Close {expired} timed-out attempt{expired === 1 ? "" : "s"}</SubmitButton></form>}
          {e.results_released ? (
            <form action={examAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="op" value="withdraw" /><ConfirmSubmit title="Withdraw results?" description="Students will no longer see their marked papers." confirmLabel="Withdraw" size="md">Withdraw results</ConfirmSubmit></form>
          ) : allMarked && (
            <form action={examAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="op" value="release" /><ConfirmSubmit variant="primary" title="Release results?" description="Students (and linked parents) will see their scores, the correct answers and your feedback." confirmLabel="Release" size="md">Release results</ConfirmSubmit></form>
          )}
          {!locked && <form action={examAction}><input type="hidden" name="examId" value={e.id} /><input type="hidden" name="op" value="delete" /><ConfirmSubmit title="Delete exam?" description="The exam and its paper will be deleted. Questions stay in the bank." confirmLabel="Delete" size="md">Delete</ConfirmSubmit></form>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Paper · ${paper?.length ?? 0} questions · ${totalMarks} marks`} description={locked ? "Locked: students have started this exam." : "Questions appear to students in random order if shuffling is on."} />
          {!paper?.length ? (
            <EmptyState title="No questions yet">Add questions from the bank below.</EmptyState>
          ) : (
            <ol className="divide-y divide-border">
              {paper.map((p, i) => (
                <li key={p.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2">{p.questions.prompt}</p>
                    <p className="text-xs text-muted-foreground">{QUESTION_TYPES.find((t) => t.value === p.questions.type)?.label} · {Number(p.marks)} marks · {sourceLabel(p.questions.source)}</p>
                  </div>
                  {writable && !locked && <form action={removeExamQuestion}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="examId" value={e.id} /><button type="submit" className={buttonClass("ghost", "sm")}>Remove</button></form>}
                </li>
              ))}
            </ol>
          )}
          {writable && !locked && (
            <CardBody className="border-t border-border">
              <form action={addExamQuestions} className="space-y-3">
                <input type="hidden" name="examId" value={e.id} />
                <p className="text-sm font-medium">Add from the {labelFrom(l.subjects, e.subject_id)} question bank</p>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {(bank ?? []).filter((q) => !onPaper.has(q.id)).map((q) => (
                    <label key={q.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-muted">
                      <input type="checkbox" name="questionId" value={q.id} className="mt-0.5 h-4 w-4 accent-[var(--royal)]" />
                      <span className="min-w-0"><span className="line-clamp-1">{q.prompt}</span><span className="text-xs text-muted-foreground">{QUESTION_TYPES.find((t) => t.value === q.type)?.label} · {Number(q.marks)} marks</span></span>
                    </label>
                  ))}
                  {!(bank ?? []).some((q) => !onPaper.has(q.id)) && <p className="px-2 py-1 text-sm text-muted-foreground">No more questions. <Link href={`/school/questions?subject=${e.subject_id}`} className="font-medium text-royal hover:underline">Write some</Link>.</p>}
                </div>
                <SubmitButton size="sm" variant="secondary">Add selected</SubmitButton>
              </form>
            </CardBody>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={`Scripts · ${attempts?.length ?? 0}`} description={toMark ? `${toMark} need written answers marked.` : "Objective questions are marked automatically on submission."} />
            {!attempts?.length ? (
              <EmptyState title="No attempts yet" />
            ) : (
              <Table>
                <thead><tr><Th>Student</Th><Th>Status</Th><Th className="text-right">Score</Th></tr></thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id}>
                      <Td><Link href={`/school/exams/${e.id}/scripts/${a.id}`} className="font-medium hover:text-royal hover:underline">{fullName(a.students)}</Link></Td>
                      <Td><Badge tone={a.status === "marked" ? "success" : a.status === "submitted" ? "warning" : "info"}>{a.status === "in_progress" ? (Date.parse(a.deadline_at) < now ? "Timed out" : "Writing") : a.status === "submitted" ? "To mark" : "Marked"}</Badge></Td>
                      <Td className="text-right tabular-nums">{a.total_score != null ? `${Number(a.total_score)} / ${Number(a.max_score)}` : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          {writable && allMarked && e.term_id && (
            <Card>
              <CardHeader title="Count towards term results" description="Creates an assessment with every student's total, so it appears on the results sheet." />
              <CardBody><RecordForm examId={e.id} /></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
