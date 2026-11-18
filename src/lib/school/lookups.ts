import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type Option = { value: string; label: string };

/** Classes, programmes, houses, subjects, departments and terms of one school, for selects and labels (read under RLS). */
export const schoolLookups = cache(async (schoolId: string) => {
  const supabase = await createClient();
  const [classes, programmes, houses, subjects, departments, terms, settings] = await Promise.all([
    supabase.from("school_classes").select("id, name, form_level, programme_id").eq("school_id", schoolId).order("form_level").order("name"),
    supabase.from("school_programmes").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("school_houses").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("school_subjects").select("id, name, code, is_core").eq("school_id", schoolId).order("is_core", { ascending: false }).order("name"),
    supabase.from("school_departments").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("academic_terms").select("id, name, is_current, starts_on, ends_on, academic_years(name)").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    supabase.from("school_settings").select("school_days").eq("school_id", schoolId).maybeSingle(),
  ]);
  const opt = (rows: { id: string; name: string }[] | null) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));
  const termRows = (terms.data ?? []) as unknown as { id: string; name: string; is_current: boolean; starts_on: string; ends_on: string; academic_years: { name: string } | null }[];
  return {
    classes: opt(classes.data),
    classRows: classes.data ?? [],
    programmes: opt(programmes.data),
    houses: opt(houses.data),
    subjects: opt(subjects.data),
    departments: opt(departments.data),
    terms: termRows.map((t) => ({ value: t.id, label: `${t.academic_years?.name ?? ""} ${t.name}`.trim(), isCurrent: t.is_current, startsOn: t.starts_on, endsOn: t.ends_on })),
    schoolDays: ((settings.data?.school_days as number[] | undefined) ?? [1, 2, 3, 4, 5]).slice().sort(),
  };
});

export const labelFrom = (list: Option[], id: string | null | undefined) => list.find((o) => o.value === id)?.label ?? "—";

/** Picks a valid id from a query param, falling back to a default (never trusts unknown ids). */
export const pick = (list: Option[], wanted: string | undefined, fallback?: string) => (list.some((o) => o.value === wanted) ? wanted! : (fallback ?? list[0]?.value));

/** Classes the signed-in user teaches (via their linked staff record). */
export async function myTaughtClasses(schoolId: string, userId: string) {
  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("id").eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
  if (!staff) return { staffId: null, assignments: [] as { class_id: string; subject_id: string }[] };
  const { data } = await supabase.from("teacher_assignments").select("class_id, subject_id").eq("staff_id", staff.id);
  return { staffId: staff.id as string, assignments: data ?? [] };
}
