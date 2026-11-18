"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { brandingSchema, friendlyDbError, schoolProfileSchema, schoolSettingsSchema } from "@/lib/validation/school";

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_LOGO_BYTES = 1024 * 1024;

export async function updateSchoolProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("school.settings.manage", { write: true });
  const parsed = schoolProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("schools")
    .update({
      address: v.address,
      district: v.district,
      email: v.email,
      phone: v.phone,
      website: v.website ?? null,
      headmaster_name: v.headmasterName,
      description: v.description ?? null,
      public_listing: v.publicListing === "on",
    })
    .eq("id", school.schoolId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "school.profile_updated", p_entity_type: "school", p_entity_id: school.schoolId, p_summary: "Updated school profile", p_school_id: school.schoolId });
  revalidatePath("/school", "layout");
  return { ok: true, message: "School profile saved." };
}

/** Saves colours and motto and, if provided, uploads a logo to the school's own storage folder (enforced by storage RLS). */
export async function updateBranding(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("school.branding.manage", { write: true });
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const update: Record<string, unknown> = { primary_color: parsed.data.primaryColor, secondary_color: parsed.data.secondaryColor, motto: parsed.data.motto ?? null };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type];
    if (!ext) return { ok: false, errors: { logo: ["Upload a PNG, JPEG or WebP image"] } };
    if (logo.size > MAX_LOGO_BYTES) return { ok: false, errors: { logo: ["The logo must be 1 MB or smaller"] } };
    const path = `${school.schoolId}/logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("school-logos").upload(path, logo, { contentType: logo.type, upsert: false, cacheControl: "31536000" });
    if (uploadError) return { ok: false, errors: { logo: ["The logo could not be uploaded. Please try again."] } };
    update.logo_path = path;
  }

  const { error } = await supabase.from("school_branding").update(update).eq("school_id", school.schoolId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "school.branding_updated", p_entity_type: "school_branding", p_entity_id: school.schoolId, p_summary: "Updated school branding", p_school_id: school.schoolId });
  revalidatePath("/school", "layout");
  return { ok: true, message: "Branding saved." };
}

export async function updateSchoolSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("school.settings.manage", { write: true });
  const parsed = schoolSettingsSchema.safeParse({ ...Object.fromEntries(formData), schoolDays: formData.getAll("schoolDays") });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_settings")
    .update({
      form_levels: v.formLevels,
      period_minutes: v.periodMinutes,
      school_days: [...new Set(v.schoolDays)].sort(),
      parent_portal_enabled: v.parentPortal === "on",
      student_portal_enabled: v.studentPortal === "on",
      confirmed_at: new Date().toISOString(),
    })
    .eq("school_id", school.schoolId);
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "school.settings_updated", p_entity_type: "school_settings", p_entity_id: school.schoolId, p_summary: "Updated school settings", p_school_id: school.schoolId });
  revalidatePath("/school", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function launchSchool() {
  const { school } = await requireSchoolPermission("school.settings.manage", { write: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_school_onboarding", { p_school: school.schoolId });
  revalidatePath("/school", "layout");
  redirect(error ? "/school/onboarding?step=10&error=1" : "/school?launched=1");
}
