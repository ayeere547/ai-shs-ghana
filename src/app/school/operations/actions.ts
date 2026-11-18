"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchool, requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const dbMsg = (m: string) => (/room is full|Only boarding|only$|copies are on loan|in stock/.test(m) ? m.replace(/^[a-z]/, (c) => c.toUpperCase()) : /students_one_active|boarding_allocations_one_active/.test(m) ? "That student already has a bed. Release it first." : friendlyDbError(m));

/* ---------------------------------- boarding ---------------------------------- */

export async function allocateBed(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("boarding.manage", { write: true });
  const v = z.object({ studentId: z.uuid("Choose a student"), roomId: z.uuid("Choose a room"), bed: z.string().trim().max(20).optional() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return fieldErrors(v.error);
  const supabase = await createClient();
  const { error } = await supabase.from("boarding_allocations").insert({ school_id: school.schoolId, student_id: v.data.studentId, room_id: v.data.roomId, bed_label: v.data.bed || null });
  if (error) return { ok: false, message: dbMsg(error.message) };
  revalidatePath("/school/boarding");
  return { ok: true, message: "Bed allocated." };
}

export async function releaseBed(formData: FormData) {
  const { school } = await requireSchoolPermission("boarding.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("boarding_allocations").update({ released_on: new Date().toISOString().slice(0, 10) }).eq("id", id.data).eq("school_id", school.schoolId);
  revalidatePath("/school/boarding");
}

/* ------------------------------- library lending ------------------------------- */

export async function issueBook(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("library.circulation", { write: true });
  const v = z
    .object({ bookId: z.uuid("Choose a book"), borrower: z.string().regex(/^(student|staff):[0-9a-f-]{36}$/i, "Choose a borrower"), dueOn: z.iso.date("Choose a due date") })
    .safeParse(Object.fromEntries(formData));
  if (!v.success) return fieldErrors(v.error);
  const [kind, id] = v.data.borrower.split(":");
  const supabase = await createClient();
  const { error } = await supabase.from("library_loans").insert({ school_id: school.schoolId, book_id: v.data.bookId, due_on: v.data.dueOn, ...(kind === "student" ? { student_id: id } : { staff_id: id }) });
  if (error) return { ok: false, message: dbMsg(error.message) };
  revalidatePath("/school/books");
  return { ok: true, message: "Book issued." };
}

export async function returnBook(formData: FormData) {
  const { school } = await requireSchoolPermission("library.circulation", { write: true });
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("library_loans").update({ returned_on: new Date().toISOString().slice(0, 10) }).eq("id", id.data).eq("school_id", school.schoolId).is("returned_on", null);
  revalidatePath("/school/books");
}

/* ------------------------------ stores & maintenance ----------------------------- */

export async function moveStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("inventory.manage", { write: true });
  const v = z.object({ itemId: z.uuid(), kind: z.enum(["in", "out", "adjust"]), quantity: z.coerce.number().positive("Enter a quantity").max(10000000), note: z.string().trim().max(200).optional() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return fieldErrors(v.error);
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_transactions").insert({ school_id: school.schoolId, item_id: v.data.itemId, kind: v.data.kind, quantity: v.data.quantity, note: v.data.note || null });
  if (error) return { ok: false, message: dbMsg(error.message) };
  revalidatePath("/school/inventory");
  return { ok: true, message: v.data.kind === "in" ? "Stock received." : v.data.kind === "out" ? "Stock issued." : "Count adjusted." };
}

export async function reportFault(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchool();
  const v = z.object({ location: z.string().trim().min(2, "Where is it?").max(120), description: z.string().trim().min(3, "Describe the problem").max(1000), priority: z.enum(["low", "normal", "urgent"]), assetId: z.string().optional().transform((x) => x || null).pipe(z.uuid().nullable()) }).safeParse(Object.fromEntries(formData));
  if (!v.success) return fieldErrors(v.error);
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_requests").insert({ school_id: school.schoolId, location: v.data.location, description: v.data.description, priority: v.data.priority, asset_id: v.data.assetId });
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "Only staff can report maintenance issues." : friendlyDbError(error.message) };
  revalidatePath("/school/maintenance");
  return { ok: true, message: "Reported. The stores team has been notified on their maintenance list." };
}

export async function updateFault(formData: FormData) {
  const { school } = await requireSchoolPermission("inventory.manage", { write: true });
  const v = z.object({ id: z.uuid(), status: z.enum(["open", "in_progress", "done", "cancelled"]), assignedTo: z.string().trim().max(120).optional() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const supabase = await createClient();
  await supabase.from("maintenance_requests").update({ status: v.data.status, assigned_to: v.data.assignedTo || null, resolved_at: v.data.status === "done" ? new Date().toISOString() : null }).eq("id", v.data.id).eq("school_id", school.schoolId);
  revalidatePath("/school/maintenance");
}

/* ------------------------------------ health ------------------------------------ */

export async function saveHealthRecord(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("health.manage", { write: true });
  const opt = (max: number) => z.string().trim().max(max).optional().transform((x) => x || null);
  const v = z
    .object({ studentId: z.uuid(), bloodGroup: z.string().optional().transform((x) => x || null).pipe(z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable()), sickleCell: z.string().optional().transform((x) => x || null).pipe(z.enum(["AA", "AS", "SS", "SC", "unknown"]).nullable()), allergies: opt(1000), conditions: opt(1000), medications: opt(1000), notes: opt(2000) })
    .safeParse(Object.fromEntries(formData));
  if (!v.success) return fieldErrors(v.error);
  const d = v.data;
  const supabase = await createClient();
  const { error } = await supabase.from("health_records").upsert(
    { school_id: school.schoolId, student_id: d.studentId, blood_group: d.bloodGroup, sickle_cell_status: d.sickleCell, allergies: d.allergies, conditions: d.conditions, medications: d.medications, notes: d.notes },
    { onConflict: "student_id" },
  );
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  await supabase.rpc("log_audit", { p_action: "health.record_updated", p_entity_type: "student", p_entity_id: d.studentId, p_summary: "Health record updated", p_school_id: school.schoolId });
  revalidatePath("/school/health");
  return { ok: true, message: "Health record saved." };
}

export async function recordClinicVisit(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("health.manage", { write: true });
  const v = z
    .object({ studentId: z.uuid(), complaint: z.string().trim().min(2, "What was the complaint?").max(500), treatment: z.string().trim().max(1000).optional(), outcome: z.enum(["returned_to_class", "rest_in_sickbay", "sent_home", "referred_to_hospital"]), share: z.literal("on").optional() })
    .safeParse(Object.fromEntries(formData));
  if (!v.success) return fieldErrors(v.error);
  const supabase = await createClient();
  const { error } = await supabase.from("clinic_visits").insert({ school_id: school.schoolId, student_id: v.data.studentId, complaint: v.data.complaint, treatment: v.data.treatment || null, outcome: v.data.outcome, share_with_guardian: v.data.share === "on" });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  if (v.data.share === "on") {
    const { guardianUsers, notifyUsers } = await import("@/lib/notify");
    await notifyUsers({ schoolId: school.schoolId, userIds: await guardianUsers([v.data.studentId]), category: "attendance", title: "School clinic visit", body: "Your child visited the school clinic today. Details are in the parent portal.", link: "/parent" });
  }
  revalidatePath("/school/health");
  return { ok: true, message: "Visit recorded." };
}
