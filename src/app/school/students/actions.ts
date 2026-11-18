"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { guardianSchema, statusChangeSchema, studentSchema, toStudentRow, validateImport } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const MAX_IMPORT_ROWS = 1000;
const MAX_IMPORT_BYTES = 1024 * 1024;

export async function saveStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const id = formData.get("id") ? z.uuid().safeParse(formData.get("id")) : null;
  if (id && !id.success) return { ok: false, message: "Invalid record." };
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createClient();
  let studentNumber = parsed.data.studentNumber;
  if (!studentNumber && !id) {
    const { data, error } = await supabase.rpc("next_school_number", { p_school: school.schoolId, p_kind: "student" });
    if (error) return { ok: false, message: friendlyDbError(error.message) };
    studentNumber = data as string;
  }

  const row = { ...toStudentRow(parsed.data), ...(studentNumber ? { student_number: studentNumber } : {}) };
  const res = id?.data
    ? await supabase.from("students").update(row).eq("id", id.data).eq("school_id", school.schoolId).select("id").single()
    : await supabase.from("students").insert({ ...row, school_id: school.schoolId }).select("id").single();
  if (res.error) {
    const msg = /students_school_id_student_number_key/.test(res.error.message) ? "Another student already has this student number." : friendlyDbError(res.error.message);
    return { ok: false, message: msg, values: formValues(formData) };
  }
  await supabase.rpc("log_audit", {
    p_action: id?.data ? "student.updated" : "student.admitted",
    p_entity_type: "student",
    p_entity_id: res.data.id,
    p_summary: `${id?.data ? "Updated" : "Admitted"} ${parsed.data.firstName} ${parsed.data.lastName}`,
    p_school_id: school.schoolId,
  });
  revalidatePath("/school/students", "layout");
  if (!id?.data) redirect(`/school/students/${res.data.id}?created=1`);
  return { ok: true, message: "Student record saved." };
}

export async function addGuardian(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const studentId = z.uuid().safeParse(formData.get("studentId"));
  if (!studentId.success) return { ok: false, message: "Invalid student." };
  const parsed = guardianSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const g = parsed.data;
  const supabase = await createClient();
  const { data: guardian, error } = await supabase
    .from("guardians")
    .insert({ school_id: school.schoolId, full_name: g.fullName, phone: g.phone, email: g.email ?? null, occupation: g.occupation ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, message: friendlyDbError(error.message), values: formValues(formData) };
  if (g.isPrimary) await supabase.from("student_guardians").update({ is_primary: false }).eq("student_id", studentId.data);
  const link = await supabase
    .from("student_guardians")
    .insert({ school_id: school.schoolId, student_id: studentId.data, guardian_id: guardian.id, relationship: g.relationship, is_primary: g.isPrimary === "on" });
  if (link.error) return { ok: false, message: friendlyDbError(link.error.message) };
  revalidatePath(`/school/students/${studentId.data}`);
  return { ok: true, message: `${g.fullName} added.` };
}

export async function updateGuardianLink(formData: FormData) {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const input = z.object({ linkId: z.uuid(), studentId: z.uuid(), op: z.enum(["remove", "toggle_view"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  if (input.data.op === "remove") {
    await supabase.from("student_guardians").delete().eq("id", input.data.linkId).eq("school_id", school.schoolId);
  } else {
    const { data } = await supabase.from("student_guardians").select("can_view_records").eq("id", input.data.linkId).single();
    if (data) await supabase.from("student_guardians").update({ can_view_records: !data.can_view_records }).eq("id", input.data.linkId);
  }
  await supabase.rpc("log_audit", { p_action: `guardian.${input.data.op}`, p_entity_type: "student", p_entity_id: input.data.studentId, p_summary: input.data.op === "remove" ? "Removed guardian link" : "Changed guardian record access", p_school_id: school.schoolId });
  revalidatePath(`/school/students/${input.data.studentId}`);
}

/** Links a student or guardian record to a sign-in account (the account must already exist). */
export async function linkAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchoolPermission("students.manage", { write: true });
  const input = z.object({ kind: z.enum(["student", "guardian"]), recordId: z.uuid(), studentId: z.uuid(), email: emailSchema }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, errors: { email: ["Enter a valid email address"] } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_account", { p_kind: input.data.kind, p_record: input.data.recordId, p_email: input.data.email });
  if (error) {
    if (/no_account/.test(error.message)) return { ok: false, errors: { email: ["No account uses this email. Ask them to create one at /register first."] } };
    if (/staff member/.test(error.message)) return { ok: false, errors: { email: ["That account belongs to a staff member of this school."] } };
    return { ok: false, message: friendlyDbError(error.message) };
  }
  revalidatePath(`/school/students/${input.data.studentId}`);
  return { ok: true, message: "Account linked. They can now sign in and see this record." };
}

export async function unlinkAccount(formData: FormData) {
  await requireSchoolPermission("students.manage", { write: true });
  const input = z.object({ kind: z.enum(["student", "guardian"]), recordId: z.uuid(), studentId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  await supabase.rpc("unlink_account", { p_kind: input.data.kind, p_record: input.data.recordId });
  revalidatePath(`/school/students/${input.data.studentId}`);
}

export async function changeStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchoolPermission("students.manage", { write: true });
  const studentId = z.uuid().safeParse(formData.get("studentId"));
  const parsed = statusChangeSchema.safeParse(Object.fromEntries(formData));
  if (!studentId.success || !parsed.success) return { ok: false, message: "Check the status details." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_student_status", {
    p_student: studentId.data,
    p_status: parsed.data.status,
    p_class: parsed.data.classId,
    p_reason: parsed.data.reason ?? null,
    p_effective: parsed.data.effectiveOn ?? null,
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath(`/school/students/${studentId.data}`);
  revalidatePath("/school/students");
  return { ok: true, message: "Status updated and recorded in the student's history." };
}

export async function saveSubjects(formData: FormData) {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const studentId = z.uuid().safeParse(formData.get("studentId"));
  const subjects = z.array(z.uuid()).max(30).safeParse(formData.getAll("subjects"));
  if (!studentId.success || !subjects.success) return;
  const supabase = await createClient();
  await supabase.from("subject_registrations").delete().eq("student_id", studentId.data).not("subject_id", "in", `(${subjects.data.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (subjects.data.length) {
    await supabase
      .from("subject_registrations")
      .upsert(subjects.data.map((subject_id) => ({ school_id: school.schoolId, student_id: studentId.data, subject_id })), { onConflict: "student_id,subject_id", ignoreDuplicates: true });
  }
  revalidatePath(`/school/students/${studentId.data}`);
}

export async function promoteClass(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchoolPermission("students.manage", { write: true });
  const input = z
    .object({ fromClass: z.uuid("Choose the class to move"), toClass: z.string(), confirm: z.literal("on", { message: "Confirm the move" }) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return fieldErrors(input.error);
  const graduate = input.data.toClass === "graduate";
  const to = graduate ? null : z.uuid().safeParse(input.data.toClass);
  if (!graduate && !to?.success) return { ok: false, errors: { toClass: ["Choose a destination class or graduation"] } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promote_class", { p_from: input.data.fromClass, p_to: graduate ? null : to!.data });
  if (error) return { ok: false, message: friendlyDbError(error.message) };
  revalidatePath("/school/students", "layout");
  return { ok: true, message: `${data} student${data === 1 ? "" : "s"} ${graduate ? "graduated" : "moved"}. Each move is recorded in the students' history.` };
}

/* ------------------------------------------------------------------------------------------ */
/* CSV import: preview validates; commit re-validates on the server before writing anything.  */
/* ------------------------------------------------------------------------------------------ */

export type ImportState = FormState & {
  csv?: string;
  summary?: { total: number; valid: number; invalid: number; duplicates: number };
  rows?: { line: number; label: string; errors: string[]; duplicate?: string }[];
  imported?: number;
};

async function loadImportContext(schoolId: string) {
  const supabase = await createClient();
  const [classes, programmes, houses, existing] = await Promise.all([
    supabase.from("school_classes").select("id, name").eq("school_id", schoolId),
    supabase.from("school_programmes").select("id, name").eq("school_id", schoolId),
    supabase.from("school_houses").select("id, name").eq("school_id", schoolId),
    supabase.from("students").select("student_number, first_name, last_name, date_of_birth").eq("school_id", schoolId).limit(20000),
  ]);
  return { classes: classes.data ?? [], programmes: programmes.data ?? [], houses: houses.data ?? [], existing: existing.data ?? [], maxRows: MAX_IMPORT_ROWS };
}

export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file to upload." };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: "The file is larger than 1 MB. Split it into smaller files." };
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return { ok: false, message: "Upload a .csv file. In Excel use File → Save As → CSV UTF-8." };
  const csv = await file.text();
  const { rows, headerError } = validateImport(csv, await loadImportContext(school.schoolId));
  if (headerError) return { ok: false, message: headerError };
  const invalid = rows.filter((r) => r.errors.length).length;
  const duplicates = rows.filter((r) => r.duplicate).length;
  return {
    ok: true,
    csv,
    summary: { total: rows.length, valid: rows.length - invalid - duplicates, invalid, duplicates },
    rows: rows.filter((r) => r.errors.length || r.duplicate).slice(0, 200).map(({ line, label, errors, duplicate }) => ({ line, label, errors, duplicate })),
  };
}

export async function commitImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const csv = String(formData.get("csv") ?? "");
  if (!csv || csv.length > MAX_IMPORT_BYTES) return { ok: false, message: "Upload the file again." };
  const ip = await clientIp();
  if (!rateLimit(`student-import:${school.schoolId}:${ip}`, 10, 60 * 60_000).ok) return { ok: false, message: "Too many imports in a short time. Try again later." };

  const { rows, headerError } = validateImport(csv, await loadImportContext(school.schoolId));
  if (headerError) return { ok: false, message: headerError };
  const good = rows.filter((r) => !r.errors.length && !r.duplicate && r.data);
  if (!good.length) return { ok: false, message: "There are no valid, non-duplicate rows to import." };

  const supabase = await createClient();
  const records: (NonNullable<(typeof good)[number]["data"]> & { student_number: string; school_id: string })[] = [];
  for (const r of good) {
    let number = r.data!.student_number;
    if (!number) {
      const { data, error } = await supabase.rpc("next_school_number", { p_school: school.schoolId, p_kind: "student" });
      if (error) return { ok: false, message: friendlyDbError(error.message) };
      number = data as string;
    }
    records.push({ ...r.data!, student_number: number, school_id: school.schoolId });
  }
  const { data: inserted, error } = await supabase.from("students").insert(records).select("id, student_number");
  if (error) return { ok: false, message: `Nothing was imported: ${friendlyDbError(error.message)}` };

  // Guardians (one per row, when provided)
  const byNumber = new Map((inserted ?? []).map((s) => [s.student_number, s.id]));
  const withGuardian = good.map((r, i) => ({ g: r.guardian, studentId: byNumber.get(records[i].student_number) })).filter((x) => x.g && x.studentId);
  if (withGuardian.length) {
    const { data: gs } = await supabase
      .from("guardians")
      .insert(withGuardian.map((x) => ({ school_id: school.schoolId, full_name: x.g!.full_name, phone: x.g!.phone })))
      .select("id");
    if (gs?.length === withGuardian.length) {
      await supabase.from("student_guardians").insert(
        withGuardian.map((x, i) => ({ school_id: school.schoolId, student_id: x.studentId, guardian_id: gs[i].id, relationship: x.g!.relationship, is_primary: true })),
      );
    }
  }

  await supabase.rpc("log_audit", { p_action: "students.imported", p_entity_type: "student", p_summary: `Imported ${inserted?.length ?? 0} students from CSV`, p_school_id: school.schoolId });
  revalidatePath("/school/students", "layout");
  return { ok: true, imported: inserted?.length ?? 0, message: `${inserted?.length ?? 0} students imported.` };
}
