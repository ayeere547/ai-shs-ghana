"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchool } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

async function requireAssessor() {
  const ctx = await requireSchool();
  const p = ctx.school.permissions;
  if (ctx.school.schoolStatus !== "active" || !(p.has("assessments.record") || p.has("assessments.manage"))) redirect("/school?denied=1");
  return ctx;
}

const assessmentSchema = z.object({
  termId: z.uuid("Choose a term"),
  classId: z.uuid("Choose a class"),
  subjectId: z.uuid("Choose a subject"),
  name: z.string().trim().min(2, "Enter a name").max(80),
  kind: z.enum(["class_test", "assignment", "project", "mid_term", "end_of_term", "mock"]),
  maxScore: z.coerce.number().positive("Enter the maximum score").max(1000),
  weight: z.coerce.number().positive("Enter a weight above 0").max(100),
  assessedOn: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
});

export async function createAssessment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireAssessor();
  const parsed = assessmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .insert({ school_id: school.schoolId, term_id: v.termId, class_id: v.classId, subject_id: v.subjectId, name: v.name, kind: v.kind, max_score: v.maxScore, weight: v.weight, assessed_on: v.assessedOn })
    .select("id")
    .single();
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only create assessments for subjects you teach in that class." : friendlyDbError(error.message), values: formValues(formData) };
  await supabase.rpc("log_audit", { p_action: "assessment.created", p_entity_type: "assessment", p_entity_id: data.id, p_summary: `Created ${v.name}`, p_school_id: school.schoolId });
  redirect(`/school/assessments/${data.id}`);
}

export async function deleteAssessment(formData: FormData) {
  const { school } = await requireAssessor();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("assessments").delete().eq("id", id.data).eq("school_id", school.schoolId).select("name");
  if (data?.length) await supabase.rpc("log_audit", { p_action: "assessment.deleted", p_entity_type: "assessment", p_entity_id: id.data, p_summary: `Deleted ${data[0].name} and its scores`, p_school_id: school.schoolId });
  redirect("/school/assessments");
}

/** Saves the score sheet. Blank cells clear a score; the database checks the maximum and the class. */
export async function saveScores(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireAssessor();
  const id = z.uuid().safeParse(formData.get("assessmentId"));
  if (!id.success) return { ok: false, message: "Invalid assessment." };
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("max_score, name").eq("id", id.data).maybeSingle();
  if (!a) return { ok: false, message: "Assessment not found." };

  const upserts: { school_id: string; assessment_id: string; student_id: string; score: number }[] = [];
  const clears: string[] = [];
  const errors: Record<string, string[]> = {};
  for (const [key, raw] of formData.entries()) {
    const m = /^score:([0-9a-f-]{36})$/i.exec(key);
    if (!m) continue;
    const text = String(raw).trim();
    if (text === "") {
      clears.push(m[1]);
      continue;
    }
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > Number(a.max_score)) errors[`score:${m[1]}`] = [`0–${a.max_score}`];
    else upserts.push({ school_id: school.schoolId, assessment_id: id.data, student_id: m[1], score: Math.round(n * 100) / 100 });
  }
  if (Object.keys(errors).length) return { ok: false, errors, message: `Scores must be between 0 and ${a.max_score}.`, values: formValues(formData) };

  if (upserts.length) {
    const { error } = await supabase.from("assessment_scores").upsert(upserts, { onConflict: "assessment_id,student_id" });
    if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can only enter scores for subjects you teach." : friendlyDbError(error.message), values: formValues(formData) };
  }
  if (clears.length) await supabase.from("assessment_scores").delete().eq("assessment_id", id.data).in("student_id", clears);
  await supabase.rpc("log_audit", { p_action: "scores.saved", p_entity_type: "assessment", p_entity_id: id.data, p_summary: `Saved ${upserts.length} scores for ${a.name}`, p_school_id: school.schoolId });
  revalidatePath(`/school/assessments/${id.data}`);
  revalidatePath("/school/results");
  return { ok: true, message: `${upserts.length} scores saved.` };
}
