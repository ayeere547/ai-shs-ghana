import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import type { OnboardingCounts } from "./onboarding";

/** Counts used by the dashboard and onboarding wizard (read under RLS for the current school). */
export const schoolCounts = cache(async (schoolId: string) => {
  const supabase = await createClient();
  const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("school_id", schoolId);
  const members = () => supabase.from("school_memberships").select("id, roles!inner(key)", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active");

  const [years, currentYear, terms, programmes, classes, subjects, departments, houses, staff, students, school, branding, settings] = await Promise.all([
    count("academic_years"),
    count("academic_years").eq("is_current", true),
    count("academic_terms"),
    count("school_programmes"),
    count("school_classes"),
    count("school_subjects"),
    count("school_departments"),
    count("school_houses"),
    members().not("roles.key", "in", "(student,parent)"),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
    supabase.from("schools").select("status, onboarding_completed_at").eq("id", schoolId).single(),
    supabase.from("school_branding").select("primary_color, secondary_color, motto, logo_path").eq("school_id", schoolId).maybeSingle(),
    supabase.from("school_settings").select("confirmed_at").eq("school_id", schoolId).maybeSingle(),
  ]);

  const onboarding: OnboardingCounts = {
    status: school.data?.status ?? "pending_verification",
    hasLogoOrMotto: Boolean(branding.data?.logo_path || branding.data?.motto),
    brandingCustomised: Boolean(branding.data && (branding.data.primary_color !== "#0b2545" || branding.data.secondary_color !== "#1d4ed8")),
    years: years.count ?? 0,
    currentYear: (currentYear.count ?? 0) > 0,
    terms: terms.count ?? 0,
    programmes: programmes.count ?? 0,
    classes: classes.count ?? 0,
    staff: staff.count ?? 0,
    students: students.count ?? 0,
    settingsReviewed: Boolean(settings.data?.confirmed_at),
    launched: Boolean(school.data?.onboarding_completed_at),
  };

  return {
    years: years.count ?? 0,
    terms: terms.count ?? 0,
    programmes: programmes.count ?? 0,
    classes: classes.count ?? 0,
    subjects: subjects.count ?? 0,
    departments: departments.count ?? 0,
    houses: houses.count ?? 0,
    staff: staff.count ?? 0,
    students: students.count ?? 0,
    onboarding,
  };
});
