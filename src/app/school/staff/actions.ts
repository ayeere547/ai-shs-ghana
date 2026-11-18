"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { assignmentSchema, staffSchema, toStaffRow } from "@/lib/staff/schema";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

export async function saveStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("staff.manage", { write: true });
  const id = formData.get("id") ? z.uuid().safeParse(formData.get("id")) : null;
  if (id && !id.success) return { ok: false, message: "Invalid record." };
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createClient();
  let staffNumber = parsed.data.staffNumber;
  if (!staffNumber && !id) {
    const { data, error } = await supabase.rpc("next_school_number", { p_school: school.schoolId, p_kind: "staff" });
    if (error) return { ok: false, message: friendlyDbError(error.message) };
    staffNumber = data as string;
  }
  const row = { ...toStaffRow(parsed.data), ...(staffNumber ? { staff_number: staffNumber } : {}) };
  const res = id?.data
    ? await supabase.from("staff").update(row).eq("id", id.data).eq("school_id", school.schoolId).select("id").single()
    : await supabase.from("staff").insert({ ...row, school_id: school.schoolId }).select("id").single();
  if (res.error) {
    const msg = /staff_school_id_staff_number_key/.test(res.error.message) ? "Another staff member already has this staff number." : friendlyDbError(res.error.message);
    return { ok: false, message: msg, values: formValues(formData) };
  }
  await supabase.rpc("log_audit", {
    p_action: id?.data ? "staff.updated" : "staff.created",
    p_entity_type: "staff",
    p_entity_id: res.data.id,
    p_summary: `${id?.data ? "Updated" : "Added"} ${parsed.data.firstName} ${parsed.data.lastName}`,
    p_school_id: school.schoolId,
  });
  revalidatePath("/school/staff", "layout");
  if (!id?.data) redirect(`/school/staff/${res.data.id}?created=1`);
  return { ok: true, message: "Staff record saved." };
}

export async function addAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("staff.manage", { write: true });
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("teacher_assignments").insert({
    school_id: school.schoolId,
    staff_id: parsed.data.staffId,
    class_id: parsed.data.classId,
    subject_id: parsed.data.subjectId,
    periods_per_week: parsed.data.periodsPerWeek,
  });
  if (error) {
    if (/teacher_assignments_class_id_subject_id_key/.test(error.message)) return { ok: false, message: "Another teacher already teaches this subject to that class. Remove that assignment first." };
    return { ok: false, message: friendlyDbError(error.message) };
  }
  await supabase.rpc("log_audit", { p_action: "staff.assignment_added", p_entity_type: "staff", p_entity_id: parsed.data.staffId, p_summary: "Teaching assignment added", p_school_id: school.schoolId });
  revalidatePath(`/school/staff/${parsed.data.staffId}`);
  return { ok: true, message: "Assignment added." };
}

export async function removeAssignment(formData: FormData) {
  const { school } = await requireSchoolPermission("staff.manage", { write: true });
  const input = z.object({ assignmentId: z.uuid(), staffId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  await supabase.from("teacher_assignments").delete().eq("id", input.data.assignmentId).eq("school_id", school.schoolId);
  await supabase.rpc("log_audit", { p_action: "staff.assignment_removed", p_entity_type: "staff", p_entity_id: input.data.staffId, p_summary: "Teaching assignment removed", p_school_id: school.schoolId });
  revalidatePath(`/school/staff/${input.data.staffId}`);
}

export async function linkStaffAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchoolPermission("staff.manage", { write: true });
  const input = z.object({ staffId: z.uuid(), email: emailSchema }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, errors: { email: ["Enter a valid email address"] } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_staff_account", { p_staff: input.data.staffId, p_email: input.data.email });
  if (error) {
    if (/not_staff_member/.test(error.message)) return { ok: false, errors: { email: ["Add this person under Members & access with a staff role first, then link them here."] } };
    return { ok: false, message: friendlyDbError(error.message) };
  }
  revalidatePath(`/school/staff/${input.data.staffId}`);
  return { ok: true, message: "Account linked. Their teaching assignments now apply when they sign in." };
}

export async function unlinkStaffAccount(formData: FormData) {
  await requireSchoolPermission("staff.manage", { write: true });
  const staffId = z.uuid().safeParse(formData.get("staffId"));
  if (!staffId.success) return;
  const supabase = await createClient();
  await supabase.rpc("unlink_account", { p_kind: "staff", p_record: staffId.data });
  revalidatePath(`/school/staff/${staffId.data}`);
}
