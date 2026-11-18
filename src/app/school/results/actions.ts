"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

export async function setPublication(formData: FormData) {
  await requireSchoolPermission("results.publish", { write: true });
  const input = z.object({ termId: z.uuid(), classId: z.uuid(), publish: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  await supabase.rpc("publish_results", { p_term: input.data.termId, p_class: input.data.classId, p_publish: input.data.publish === "1" });
  revalidatePath("/school/results");
}

/* ----------------------------- grading schemes ----------------------------- */

export async function createScheme(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("assessments.manage", { write: true });
  const input = z.object({ name: z.string().trim().min(2, "Enter a name").max(80), makeDefault: z.literal("on").optional() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return fieldErrors(input.error);
  const supabase = await createClient();
  if (input.data.makeDefault) await supabase.from("grading_schemes").update({ is_default: false }).eq("school_id", school.schoolId).eq("is_default", true);
  const { error } = await supabase.from("grading_schemes").insert({ school_id: school.schoolId, name: input.data.name, is_default: input.data.makeDefault === "on" });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "grading.scheme_created", p_entity_type: "grading_scheme", p_summary: input.data.name, p_school_id: school.schoolId });
  revalidatePath("/school/results/grading");
  return { ok: true, message: "Scheme created. Add its grade bands below." };
}

export async function setDefaultScheme(formData: FormData) {
  const { school } = await requireSchoolPermission("assessments.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("schemeId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("grading_schemes").update({ is_default: false }).eq("school_id", school.schoolId).eq("is_default", true);
  await supabase.from("grading_schemes").update({ is_default: true }).eq("id", id.data).eq("school_id", school.schoolId);
  await supabase.rpc("log_audit", { p_action: "grading.default_changed", p_entity_type: "grading_scheme", p_entity_id: id.data, p_summary: "Default grading scheme changed", p_school_id: school.schoolId });
  revalidatePath("/school/results", "layout");
}

const bandSchema = z
  .object({
    schemeId: z.uuid(),
    grade: z.string().trim().min(1, "Enter a grade").max(8),
    minScore: z.coerce.number().min(0).max(100),
    maxScore: z.coerce.number().min(0).max(100),
    remark: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => v.maxScore >= v.minScore, { path: ["maxScore"], message: "Must be at least the minimum" });

export async function addBand(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("assessments.manage", { write: true });
  const parsed = bandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("grading_bands").select("grade, min_score, max_score").eq("scheme_id", v.schemeId);
  const overlap = (existing ?? []).find((b) => v.minScore <= Number(b.max_score) && v.maxScore >= Number(b.min_score));
  if (overlap) return { ok: false, message: `This range overlaps grade ${overlap.grade} (${overlap.min_score}–${overlap.max_score}).` };
  const { error } = await supabase.from("grading_bands").insert({ school_id: school.schoolId, scheme_id: v.schemeId, grade: v.grade, min_score: v.minScore, max_score: v.maxScore, remark: v.remark });
  if (error) return { ok: false, message: /grading_bands_scheme_id_grade_key/.test(error.message) ? "That grade already exists in this scheme." : friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "grading.band_added", p_entity_type: "grading_scheme", p_entity_id: v.schemeId, p_summary: `Grade ${v.grade}: ${v.minScore}–${v.maxScore}`, p_school_id: school.schoolId });
  revalidatePath("/school/results", "layout");
  return { ok: true, message: `Grade ${v.grade} added.` };
}

export async function deleteBand(formData: FormData) {
  const { school } = await requireSchoolPermission("assessments.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("bandId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("grading_bands").delete().eq("id", id.data).eq("school_id", school.schoolId);
  revalidatePath("/school/results", "layout");
}
