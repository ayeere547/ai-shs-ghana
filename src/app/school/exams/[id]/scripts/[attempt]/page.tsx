import { ArrowLeft, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkAnswerForm } from "@/components/exams/forms";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Script" };

type Ans = {
  id: string; response: Record<string, unknown> | null; is_correct: boolean | null; awarded_marks: number | null; needs_marking: boolean; feedback: string | null;
  exam_questions: { position: number; marks: number; questions: { type: string; prompt: string; options: { id: string; text: string }[] | null; answer: Record<string, unknown> } };
};

export default async function ScriptPage({ params }: { params: Promise<{ id: string; attempt: string }> }) {
  const { school } = await requireSchool();
  const { id, attempt } = await params;
  if (![id, attempt].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase.from("exam_attempts").select("id, status, total_score, max_score, exam_id, students(first_name, middle_name, last_name), exams(title)").eq("id", attempt).eq("exam_id", id).maybeSingle<{ id: string; status: string; total_score: number | null; max_score: number | null; exam_id: string; students: { first_name: string; middle_name: string | null; last_name: string }; exams: { title: string } }>();
  if (!a) notFound();
  const { data: answers } = await supabase.from("exam_answers").select("id, response, is_correct, awarded_marks, needs_marking, feedback, exam_questions(position, marks, questions(type, prompt, options, answer))").eq("attempt_id", attempt).returns<Ans[]>();
  const rows = (answers ?? []).sort((x, y) => x.exam_questions.position - y.exam_questions.position);
  const path = `/school/exams/${id}/scripts/${attempt}`;
  const writable = school.schoolStatus === "active" && a.status !== "in_progress";

  const responseText = (ans: Ans) => {
    const q = ans.exam_questions.questions;
    if (!ans.response) return <span className="italic text-muted-foreground">No answer</span>;
    if (q.type === "mcq") { const c = String(ans.response.choice ?? ""); return `${c.toUpperCase()}. ${q.options?.find((o) => o.id === c)?.text ?? ""}`; }
    if (q.type === "true_false") return ans.response.value ? "True" : "False";
    return <span className="whitespace-pre-wrap">{String(ans.response.text ?? "")}</span>;
  };
  const key = (ans: Ans) => {
    const q = ans.exam_questions.questions;
    if (q.type === "mcq") return `Correct: ${String(q.answer.correct).toUpperCase()}`;
    if (q.type === "true_false") return `Correct: ${q.answer.correct ? "True" : "False"}`;
    if (q.type === "short_answer") return `Accepted: ${(q.answer.accepted as string[]).join(", ")}`;
    return q.answer.guide ? `Guide: ${String(q.answer.guide)}` : null;
  };

  return (
    <>
      <Link href={`/school/exams/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {a.exams.title}</Link>
      <PageHeader title={fullName(a.students)} description={a.status === "in_progress" ? "Still writing — marking opens after submission." : `Score ${Number(a.total_score ?? 0)} / ${Number(a.max_score ?? 0)}`} actions={<Badge tone={a.status === "marked" ? "success" : "warning"}>{a.status === "marked" ? "Marked" : a.status === "submitted" ? "To mark" : "Writing"}</Badge>} />
      <div className="space-y-4">
        {rows.map((ans, i) => {
          const q = ans.exam_questions.questions;
          return (
            <Card key={ans.id}>
              <CardBody className="grid gap-4 lg:grid-cols-[1fr_16rem]">
                <div className="space-y-2 text-sm">
                  <p className="font-medium">{i + 1}. <span className="whitespace-pre-wrap font-normal">{q.prompt}</span></p>
                  <div className="rounded-md bg-surface-muted p-3">{responseText(ans)}</div>
                  {key(ans) && <p className="text-xs text-accent">{key(ans)}</p>}
                </div>
                <div className="space-y-2">
                  {q.type === "essay" ? (
                    writable ? <MarkAnswerForm answerId={ans.id} path={path} max={Number(ans.exam_questions.marks)} marks={ans.awarded_marks == null ? null : Number(ans.awarded_marks)} feedback={ans.feedback} /> : <p className="text-sm text-muted-foreground">Not marked yet</p>
                  ) : (
                    <p className="inline-flex items-center gap-1.5 text-sm">
                      {ans.is_correct ? <Check className="h-4 w-4 text-accent" /> : <X className="h-4 w-4 text-danger" />}
                      {Number(ans.awarded_marks ?? 0)} / {Number(ans.exam_questions.marks)} (auto-marked)
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
        {!rows.length && <Card><CardBody className="text-sm text-muted-foreground">No answers saved yet.</CardBody></Card>}
      </div>
    </>
  );
}
