import "server-only";

import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import type { SchoolProfile } from "@/components/school/settings-forms";

/** Public URL for a logo in the public `school-logos` bucket. Paths always come from the database. */
export const logoUrl = (path: string | null | undefined) =>
  path && publicEnv.supabaseUrl ? `${publicEnv.supabaseUrl}/storage/v1/object/public/school-logos/${path.split("/").map(encodeURIComponent).join("/")}` : null;

export async function loadSchoolConfig(schoolId: string) {
  const supabase = await createClient();
  const [{ data: school }, { data: branding }, { data: settings }] = await Promise.all([
    supabase.from("schools").select("name, school_code, address, district, email, phone, website, headmaster_name, description, public_listing").eq("id", schoolId).single<SchoolProfile & { name: string; school_code: string | null }>(),
    supabase.from("school_branding").select("primary_color, secondary_color, motto, logo_path").eq("school_id", schoolId).single(),
    supabase.from("school_settings").select("form_levels, period_minutes, school_days, parent_portal_enabled, student_portal_enabled").eq("school_id", schoolId).single(),
  ]);
  return { school, branding, settings };
}
