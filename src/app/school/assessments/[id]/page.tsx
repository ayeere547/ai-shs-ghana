import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteAssessment } from "@/app/school/assessments/actions";
import { ScoreSheet } from "@/components/assessments/forms";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Alert, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { kindLabel } from "@/lib/assessments/kinds";
import { requireSchool } from "@/lib/auth/session";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessment" };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { school } = await requireSchool();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  // RLS returns the assessment only to managers, results readers and its subject teacher.
  const { data: a } = await supabase.from("assessments").select("id, name, kind, term_id, class_id, subject_id, max_score, weight").eq("id", id).eq("school_id", school.schoolId).maybeSingle();
  if (!a) notFound();
  const [l, { data: students }, { data: scores }, { data: canEnter }, { data: published }] = await Promise.all([
    schoolLookups(school.schoolId),
    supabase.from("students").select("id, student_number, first_name, middle_name, last_name").eq("class_id", a.class_id).in("status", ["active", "suspended"]).order("last_name").order("first_name"),
    supabase.from("assessment_scores").select("student_id, score").eq("assessment_id", id),
    supabase.rpc("can_enter_scores", { p_assessment: id }),
    supabase.from("result_publications").select("id").eq("term_id", a.term_id).eq("class_id", a.class_id).maybeSingle(),
  ]);
  const byStudent = new Map((scores ?? []).map((s) => [s.student_id, s.score == null ? null : Number(s.score)]));
  const writable = Boolean(canEnter) && school.schoolStatus === "active";

  return (
    <>
      <Link href="/school/assessments" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Assessments</Link>
      <PageHeader
        title={a.name}
        description={`${kindLabel(a.kind)} · ${labelFrom(l.classes, a.class_id)} · ${labelFrom(l.subjects, a.subject_id)} · ${labelFrom(l.terms, a.term_id)} · out of ${Number(a.max_score)}, weight ${Number(a.weight)}`}
        actions={
          writable && (
            <form action={deleteAssessment}>
              <input type="hidden" name="id" value={a.id} />
              <ConfirmSubmit title="Delete assessment?" description="This deletes the assessment and every score entered for it. This cannot be undone." confirmLabel="Delete">Delete</ConfirmSubmit>
            </form>
          )
        }
      />
      {published && <Alert tone="info" className="mb-4">Results for this class and term are published — changes are visible to students and parents straight away.</Alert>}
      <Card>
        <CardBody>
          {!students?.length ? (
            <p className="text-sm text-muted-foreground">No students in this class.</p>
          ) : (
            <ScoreSheet
              assessmentId={a.id}
              maxScore={Number(a.max_score)}
              readOnly={!writable}
              students={students.map((s) => ({ id: s.id, name: fullName(s), number: s.student_number, score: byStudent.get(s.id) ?? null }))}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
