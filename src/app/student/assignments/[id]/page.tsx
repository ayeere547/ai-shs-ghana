import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitWorkForm } from "@/components/student/submit-form";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { fileLabel, signedUrls } from "@/lib/storage";
import { requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Assignment" };

export default async function StudentAssignment({ params }: { params: Promise<{ id: string }> }) {
  const { student } = await requireEnrolledStudent();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase.from("assignments").select("id, title, instructions, due_at, max_score, allow_late, school_subjects(name)").eq("id", id).maybeSingle<{ id: string; title: string; instructions: string; due_at: string; max_score: number; allow_late: boolean; school_subjects: { name: string } }>();
  if (!a) notFound();
  const { data: s } = await supabase.from("assignment_submissions").select("body, file_path, submitted_at, is_late, status, score, feedback").eq("assignment_id", id).eq("student_id", student.id).maybeSingle();
  const files = await signedUrls(supabase, [s?.file_path]);
  const closed = Date.parse(a.due_at) < Date.now() && !a.allow_late;

  return (
    <>
      <Link href="/student/assignments" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Assignments</Link>
      <PageHeader title={a.title} description={`${a.school_subjects.name} · due ${formatDate(a.due_at, { dateStyle: "full", timeStyle: "short" })} · out of ${Number(a.max_score)}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card><CardHeader title="Instructions" /><CardBody className="whitespace-pre-wrap text-sm">{a.instructions}</CardBody></Card>
          {s?.status === "returned" ? (
            <Card>
              <CardHeader title="Marked" action={<Badge tone="success">{Number(s.score)} / {Number(a.max_score)}</Badge>} />
              <CardBody className="space-y-2 text-sm">{s.feedback ? <p className="whitespace-pre-wrap">{s.feedback}</p> : <p className="text-muted-foreground">No written feedback.</p>}</CardBody>
            </Card>
          ) : closed ? (
            <Alert tone="warning">The deadline has passed{s ? "; your submission is waiting to be marked." : " and this assignment no longer accepts work."}</Alert>
          ) : (
            <Card><CardHeader title={s ? "Update your submission" : "Submit your work"} /><CardBody><SubmitWorkForm assignmentId={a.id} existing={s?.body ?? (s ? "" : null)} /></CardBody></Card>
          )}
        </div>
        {s && (
          <Card className="self-start">
            <CardHeader title="Your submission" description={`${formatDate(s.submitted_at, { dateStyle: "medium", timeStyle: "short" })}${s.is_late ? " · late" : ""}`} />
            <CardBody className="space-y-2 text-sm">
              {s.body && <p className="line-clamp-[12] whitespace-pre-wrap">{s.body}</p>}
              {s.file_path && files.get(s.file_path) && <a href={files.get(s.file_path)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-royal hover:underline"><FileText className="h-4 w-4" /> {fileLabel(s.file_path)}</a>}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
