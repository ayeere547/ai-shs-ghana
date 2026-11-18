import { ArrowLeft, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { startExam } from "@/app/student/actions";
import { ExamTaker, type PaperQuestion } from "@/components/student/exam-taker";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { EXAM_KINDS, examState } from "@/lib/exams/questions";
import { requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Exam" };

type Review = { total_score: number; max_score: number; questions: { type: string; prompt: string; marks: number; options: { id: string; text: string }[] | null; answer: Record<string, unknown> | null; source: string; response: Record<string, unknown> | null; awarded_marks: number | null; is_correct: boolean | null; feedback: string | null }[] };

export default async function StudentExam({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const { student } = await requireEnrolledStudent();
  const { id } = await params;
  const { error, submitted } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from("exams").select("id, title, kind, instructions, opens_at, closes_at, duration_minutes, is_published, results_released, school_subjects(name)").eq("id", id).maybeSingle<{ id: string; title: string; kind: string; instructions: string | null; opens_at: string; closes_at: string; duration_minutes: number; is_published: boolean; results_released: boolean; school_subjects: { name: string } }>();
  if (!e) notFound();
  const { data: attempt } = await supabase.from("exam_attempts").select("id, status").eq("exam_id", id).eq("student_id", student.id).maybeSingle();

  const header = (
    <>
      <Link href="/student/exams" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Exams</Link>
      <PageHeader title={e.title} description={`${e.school_subjects.name} · ${EXAM_KINDS.find((k) => k.value === e.kind)?.label} · ${e.duration_minutes} minutes`} />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
    </>
  );

  // In progress: load the paper (this also closes the attempt if time ran out).
  if (attempt?.status === "in_progress") {
    const { data: paper } = await supabase.rpc("exam_paper", { p_attempt: attempt.id });
    const p = paper as { status: string; deadline_at: string; server_now: string; questions: PaperQuestion[] } | null;
    if (p?.status === "in_progress") {
      return (
        <>
          {header}
          {e.instructions && <Alert tone="info" className="mb-4">{e.instructions}</Alert>}
          <ExamTaker attemptId={attempt.id} examId={e.id} deadline={p.deadline_at} serverNow={p.server_now} questions={p.questions} />
        </>
      );
    }
  }

  if (attempt && e.results_released) {
    const { data } = await supabase.rpc("exam_review", { p_attempt: attempt.id });
    const r = data as Review;
    const shown = (q: Review["questions"][number]) => {
      if (!q.response) return <span className="italic text-muted-foreground">No answer</span>;
      if (q.type === "mcq") return q.options?.find((o) => o.id === q.response!.choice)?.text ?? "—";
      if (q.type === "true_false") return q.response.value ? "True" : "False";
      return <span className="whitespace-pre-wrap">{String(q.response.text ?? "")}</span>;
    };
    const correct = (q: Review["questions"][number]) =>
      q.type === "mcq" ? q.options?.find((o) => o.id === q.answer?.correct)?.text : q.type === "true_false" ? (q.answer?.correct ? "True" : "False") : q.type === "short_answer" ? (q.answer?.accepted as string[] | undefined)?.join(" / ") : null;
    return (
      <>
        {header}
        <Card className="mb-4"><CardBody className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Your score</span><span className="text-2xl font-semibold tabular-nums">{Number(r.total_score)} / {Number(r.max_score)}</span></CardBody></Card>
        <ol className="space-y-3">
          {r.questions.map((q, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface p-5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{i + 1}. <span className="whitespace-pre-wrap font-normal">{q.prompt}</span></p>
                <span className="inline-flex shrink-0 items-center gap-1">{q.is_correct === true && <Check className="h-4 w-4 text-accent" />}{q.is_correct === false && <X className="h-4 w-4 text-danger" />}{Number(q.awarded_marks ?? 0)} / {Number(q.marks)}</span>
              </div>
              <p className="mt-2"><span className="text-muted-foreground">Your answer: </span>{shown(q)}</p>
              {correct(q) && <p className="text-accent">Correct answer: {correct(q)}</p>}
              {q.feedback && <p className="mt-1 text-muted-foreground">Teacher: {q.feedback}</p>}
              {q.source === "ai_generated" && <Badge tone="warning" className="mt-2">AI-generated practice question</Badge>}
            </li>
          ))}
        </ol>
      </>
    );
  }

  if (attempt) {
    return (<>{header}<Alert tone="success" title={submitted ? "Exam submitted" : "You've completed this exam"}>Your teacher will release the results after marking. Objective questions are already marked.</Alert></>);
  }

  const st = examState(e);
  const open = st.label === "Open now";
  return (
    <>
      {header}
      <Card>
        <CardBody className="space-y-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Opens</dt><dd>{formatDate(e.opens_at, { dateStyle: "medium", timeStyle: "short" })}</dd></div>
            <div><dt className="text-muted-foreground">Closes</dt><dd>{formatDate(e.closes_at, { dateStyle: "medium", timeStyle: "short" })}</dd></div>
            <div><dt className="text-muted-foreground">Time allowed</dt><dd>{e.duration_minutes} minutes once you start</dd></div>
          </dl>
          {e.instructions && <p className="whitespace-pre-wrap">{e.instructions}</p>}
          {open ? (
            <form action={startExam} className="space-y-2">
              <input type="hidden" name="examId" value={e.id} />
              <p className="text-muted-foreground">The timer starts as soon as you begin and can&apos;t be paused. Your answers save automatically; if your connection drops, keep going — they retry when you&apos;re back online.</p>
              <SubmitButton size="lg">Start exam</SubmitButton>
            </form>
          ) : (
            <Badge tone={st.tone}>{st.label}</Badge>
          )}
        </CardBody>
      </Card>
    </>
  );
}
