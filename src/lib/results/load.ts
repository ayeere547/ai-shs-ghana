import "server-only";

import { fullName } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";

import { computeResults, type Band } from "./compute";

/**
 * Loads and computes a class's term results under the caller's RLS: teachers without
 * results.read only get the subjects they teach, because only those assessments are visible.
 */
export async function loadClassResults(schoolId: string, termId: string, classId: string) {
  const supabase = await createClient();
  const [{ data: students }, { data: assessments }, { data: scheme }, { data: subjects }, { data: publication }] = await Promise.all([
    supabase.from("students").select("id, student_number, first_name, middle_name, last_name").eq("class_id", classId).in("status", ["active", "suspended"]).order("last_name").order("first_name"),
    supabase.from("assessments").select("id, subject_id, max_score, weight").eq("school_id", schoolId).eq("term_id", termId).eq("class_id", classId),
    supabase.from("grading_schemes").select("id, name, grading_bands(grade, min_score, max_score, remark)").eq("school_id", schoolId).eq("is_default", true).maybeSingle<{ id: string; name: string; grading_bands: Band[] }>(),
    supabase.from("school_subjects").select("id, name").eq("school_id", schoolId).order("is_core", { ascending: false }).order("name"),
    supabase.from("result_publications").select("published_at").eq("term_id", termId).eq("class_id", classId).maybeSingle(),
  ]);
  const assessmentIds = (assessments ?? []).map((a) => a.id);
  const { data: scores } = assessmentIds.length
    ? await supabase.from("assessment_scores").select("assessment_id, student_id, score").in("assessment_id", assessmentIds)
    : { data: [] as { assessment_id: string; student_id: string; score: number | null }[] };

  const results = computeResults({
    studentIds: (students ?? []).map((s) => s.id),
    assessments: (assessments ?? []).map((a) => ({ ...a, max_score: Number(a.max_score), weight: Number(a.weight) })),
    scores: scores ?? [],
    bands: scheme?.grading_bands ?? [],
  });
  const assessedSubjects = new Set((assessments ?? []).map((a) => a.subject_id));
  return {
    students: (students ?? []).map((s) => ({ id: s.id, name: fullName(s), number: s.student_number })),
    subjects: (subjects ?? []).filter((s) => assessedSubjects.has(s.id)),
    results: new Map(results.map((r) => [r.studentId, r])),
    scheme: scheme ? { id: scheme.id, name: scheme.name, hasBands: scheme.grading_bands.length > 0 } : null,
    publishedAt: publication?.published_at ?? null,
    assessmentCount: assessmentIds.length,
  };
}
