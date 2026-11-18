import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateAssignment } from "@/app/school/assignments/actions";
import { MarkForm } from "@/components/assignments/forms";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { fileLabel, signedUrls } from "@/lib/storage";
import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Assignment" };

type Submission = { id: string; student_id: string; body: string | null; file_path: string | null; submitted_at: string; is_late: boolean; status: string; score: number | null; feedback: string | null };

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { school } = await requireSchool();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase.from("assignments").select("id, title, instructions, due_at, max_score, allow_late, class_id, subject_id").eq("id", id).eq("school_id", school.schoolId).maybeSingle();
  if (!a) notFound();
  const [l, { data: students }, { data: subs }, { data: canMark }] = await Promise.all([
    schoolLookups(school.schoolId),
    supabase.from("students").select("id, student_number, first_name, middle_name, last_name").eq("class_id", a.class_id).eq("status", "active").order("last_name"),
    supabase.from("assignment_submissions").select("id, student_id, body, file_path, submitted_at, is_late, status, score, feedback").eq("assignment_id", id).returns<Submission[]>(),
    supabase.rpc("can_mark_assignment", { p_assignment: id }),
  ]);
  const byStudent = new Map((subs ?? []).map((s) => [s.student_id, s]));
  const files = await signedUrls(supabase, (subs ?? []).map((s) => s.file_path));
  const writable = Boolean(canMark) && school.schoolStatus === "active";
  const missing = (students ?? []).filter((s) => !byStudent.has(s.id));

  return (
    <>
      <Link href={`/school/assignments?pair=${a.class_id}:${a.subject_id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Assignments</Link>
      <PageHeader
        title={a.title}
        description={`${labelFrom(l.classes, a.class_id)} · ${labelFrom(l.subjects, a.subject_id)} · due ${formatDate(a.due_at, { dateStyle: "medium", timeStyle: "short" })} · out of ${Number(a.max_score)}`}
        actions={writable && (
          <>
            <form action={updateAssignment}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="op" value={a.allow_late ? "disallow_late" : "allow_late"} /><button type="submit" className={buttonClass("secondary")}>{a.allow_late ? "Stop late submissions" : "Accept late submissions"}</button></form>
            <form action={updateAssignment}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="op" value="delete" /><ConfirmSubmit title="Delete assignment?" description="This deletes every submission and mark. It cannot be undone." confirmLabel="Delete" size="md">Delete</ConfirmSubmit></form>
          </>
        )}
      />
      <Card className="mb-6"><CardHeader title="Instructions" /><CardBody className="whitespace-pre-wrap text-sm">{a.instructions}</CardBody></Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          {(students ?? []).filter((s) => byStudent.has(s.id)).map((st) => {
            const s = byStudent.get(st.id)!;
            return (
              <Card key={s.id}>
                <CardHeader
                  title={fullName(st)}
                  description={`Submitted ${formatDate(s.submitted_at, { dateStyle: "medium", timeStyle: "short" })}`}
                  action={<div className="flex gap-1">{s.is_late && <Badge tone="warning">Late</Badge>}<Badge tone={s.status === "returned" ? "success" : "info"}>{s.status === "returned" ? `Returned · ${Number(s.score)}` : "To mark"}</Badge></div>}
                />
                <CardBody className="grid gap-4 lg:grid-cols-[1fr_18rem]">
                  <div className="space-y-2 text-sm">
                    {s.body && <p className="whitespace-pre-wrap">{s.body}</p>}
                    {s.file_path && files.get(s.file_path) && <a href={files.get(s.file_path)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-royal hover:underline"><FileText className="h-4 w-4" /> {fileLabel(s.file_path)}</a>}
                  </div>
                  {writable && <MarkForm submissionId={s.id} assignmentId={a.id} maxScore={Number(a.max_score)} score={s.score == null ? null : Number(s.score)} feedback={s.feedback} />}
                </CardBody>
              </Card>
            );
          })}
          {!subs?.length && <Card><CardBody className="text-sm text-muted-foreground">No submissions yet.</CardBody></Card>}
        </div>
        <Card className="self-start">
          <CardHeader title={`Not submitted (${missing.length})`} />
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {missing.map((s) => <li key={s.id} className="px-5 py-2 text-sm">{fullName(s)}</li>)}
            {!missing.length && <li className="px-5 py-3 text-sm text-muted-foreground">Everyone has submitted.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
