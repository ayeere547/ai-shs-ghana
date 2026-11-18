import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { deleteQuestion } from "@/app/school/exams/actions";
import { QuestionForm } from "@/components/exams/forms";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { QUESTION_TYPES, sourceLabel } from "@/lib/exams/questions";
import { createClient } from "@/lib/supabase/server";
import { teachingPairs } from "@/lib/teaching";

export const metadata: Metadata = { title: "Question bank" };

type Q = { id: string; type: string; prompt: string; options: { id: string; text: string }[] | null; answer: Record<string, unknown>; marks: number; topic: string | null; difficulty: string; source: string; source_note: string | null };

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { session, school } = await requireSchool();
  if (!(school.permissions.has("classroom.teach") || school.permissions.has("classroom.manage"))) redirect("/school?denied=1");
  const pairs = await teachingPairs(school, session.userId);
  const subjects = [...new Map(pairs.map((p) => [p.subjectId, p.subjectName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const wanted = (await searchParams).subject;
  const subject = subjects.find((s) => s.value === wanted)?.value ?? subjects[0]?.value;
  if (!subject) return (<><PageHeader title="Question bank" /><Card><EmptyState icon={ListChecks} title="No subjects to teach yet" /></Card></>);

  const supabase = await createClient();
  const { data } = await supabase.from("questions").select("id, type, prompt, options, answer, marks, topic, difficulty, source, source_note").eq("school_id", school.schoolId).eq("subject_id", subject).order("created_at", { ascending: false }).limit(300).returns<Q[]>();
  const answerText = (q: Q) =>
    q.type === "mcq" ? `Answer: ${String(q.answer.correct).toUpperCase()}` : q.type === "true_false" ? `Answer: ${q.answer.correct ? "True" : "False"}` : q.type === "short_answer" ? `Accepted: ${(q.answer.accepted as string[]).join(", ")}` : "Teacher-marked";

  return (
    <>
      <PageHeader title="Question bank" description="Reusable questions for online exams and practice, shared by the teachers of each subject. Students never see answer keys." />
      <form className="mb-4 flex gap-3">
        <Select name="subject" defaultValue={subject} aria-label="Subject" className="sm:w-64">{subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        <button type="submit" className={buttonClass("secondary")}>Show</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
        <Card>
          <CardHeader title={`${data?.length ?? 0} questions`} />
          {!data?.length ? (
            <EmptyState icon={ListChecks} title="No questions yet">Add your first question with the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((q) => (
                <li key={q.id} className="space-y-1.5 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="info">{QUESTION_TYPES.find((t) => t.value === q.type)?.label}</Badge>
                    <Badge>{Number(q.marks)} mark{Number(q.marks) === 1 ? "" : "s"}</Badge>
                    <Badge>{q.difficulty}</Badge>
                    {q.topic && <Badge>{q.topic}</Badge>}
                    <Badge tone={q.source === "licensed_past_question" ? "success" : q.source === "ai_generated" ? "warning" : "neutral"} title={q.source_note ?? undefined}>{sourceLabel(q.source)}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap">{q.prompt}</p>
                  {q.options && <ol className="ml-1 text-muted-foreground">{q.options.map((o) => <li key={o.id}><span className="font-medium uppercase">{o.id}.</span> {o.text}</li>)}</ol>}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-accent">{answerText(q)}</p>
                    <form action={deleteQuestion}><input type="hidden" name="id" value={q.id} /><ConfirmSubmit title="Delete question?" description="Questions already used in an exam that students sat can't be deleted." confirmLabel="Delete">Delete</ConfirmSubmit></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {school.schoolStatus === "active" && <Card className="self-start"><CardHeader title="New question" /><CardBody><QuestionForm subjects={subjects} defaultSubject={subject} /></CardBody></Card>}
      </div>
    </>
  );
}
