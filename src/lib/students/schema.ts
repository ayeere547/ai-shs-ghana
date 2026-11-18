import { z } from "zod";

const blank = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

const name = (label: string) => z.string().trim().min(1, `Enter the ${label}`).max(80);
const optionalUuid = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());

export const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
] as const;

export const STUDENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "transferred", label: "Transferred out" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "graduated", label: "Graduated" },
] as const;

export const RELATIONSHIPS = ["mother", "father", "guardian", "grandparent", "sibling", "other"] as const;

export const studentSchema = z.object({
  studentNumber: blank.pipe(z.string().max(40).regex(/^[A-Za-z0-9/ -]+$/, "Use letters, numbers, / and - only").optional()),
  firstName: name("first name"),
  middleName: blank.pipe(z.string().max(80).optional()),
  lastName: name("surname"),
  gender: z.enum(["male", "female"], { message: "Choose a gender" }),
  dateOfBirth: blank.pipe(z.iso.date({ message: "Enter a valid date" }).optional()),
  admissionDate: z.iso.date({ message: "Enter the admission date" }),
  programmeId: optionalUuid,
  classId: optionalUuid,
  houseId: optionalUuid,
  residency: z.enum(["day", "boarding"]),
  previousSchool: blank.pipe(z.string().max(160).optional()),
});
export type StudentInput = z.infer<typeof studentSchema>;

export const toStudentRow = (v: StudentInput) => ({
  first_name: v.firstName,
  middle_name: v.middleName ?? null,
  last_name: v.lastName,
  gender: v.gender,
  date_of_birth: v.dateOfBirth ?? null,
  admission_date: v.admissionDate,
  programme_id: v.programmeId,
  class_id: v.classId,
  house_id: v.houseId,
  residency: v.residency,
  previous_school: v.previousSchool ?? null,
});

export const guardianSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the guardian's name").max(160),
  phone: z.string().trim().min(9, "Enter a valid phone number").max(32).regex(/^[+0-9 ()-]+$/, "Use digits, spaces and + only"),
  email: blank.pipe(z.email("Enter a valid email").max(254).optional()),
  relationship: z.enum(RELATIONSHIPS),
  occupation: blank.pipe(z.string().max(120).optional()),
  isPrimary: z.literal("on").optional(),
});

export const statusChangeSchema = z.object({
  status: z.enum(["active", "suspended", "transferred", "withdrawn", "graduated"]),
  classId: optionalUuid,
  reason: blank.pipe(z.string().max(500).optional()),
  effectiveOn: blank.pipe(z.iso.date().optional()),
});

/* ------------------------------------------------------------------------------------------
 * CSV import
 * ---------------------------------------------------------------------------------------- */

export const IMPORT_COLUMNS = ["student_number", "first_name", "middle_name", "last_name", "gender", "date_of_birth", "admission_date", "class", "programme", "house", "residency", "guardian_name", "guardian_phone", "guardian_relationship"] as const;

export const IMPORT_TEMPLATE = `${IMPORT_COLUMNS.join(",")}\n,Ama,,Mensah,female,2010-03-14,2026-09-01,1 Science A,General Science,,boarding,Kwame Mensah,+233240000000,father\n`;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export type Lookup = { id: string; name: string };
export type ImportRow = {
  line: number;
  errors: string[];
  duplicate?: string;
  data?: ReturnType<typeof toStudentRow> & { student_number?: string };
  guardian?: { full_name: string; phone: string; relationship: (typeof RELATIONSHIPS)[number] };
  label: string;
};

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Validates an uploaded CSV against the school's classes/programmes/houses and existing students.
 * Duplicates are detected on student number and on (first name, surname, date of birth), both
 * against existing records and within the file. Nothing is written here.
 */
export function validateImport(
  text: string,
  ctx: { classes: Lookup[]; programmes: Lookup[]; houses: Lookup[]; existing: { student_number: string; first_name: string; last_name: string; date_of_birth: string | null }[]; maxRows?: number },
): { rows: ImportRow[]; headerError?: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], headerError: "The file is empty." };
  const header = table[0].map((h) => normalise(h).replace(/ /g, "_"));
  const missing = ["first_name", "last_name", "gender"].filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], headerError: `Missing required column(s): ${missing.join(", ")}. Download the template for the expected format.` };
  if (table.length - 1 > (ctx.maxRows ?? 2000)) return { rows: [], headerError: `Import at most ${ctx.maxRows ?? 2000} students per file.` };

  const find = (list: Lookup[], v: string) => list.find((i) => normalise(i.name) === normalise(v));
  const existingNumbers = new Set(ctx.existing.map((e) => normalise(e.student_number)));
  const identity = (f: string, l: string, d: string | null | undefined) => `${normalise(f)}|${normalise(l)}|${d ?? ""}`;
  const existingPeople = new Set(ctx.existing.map((e) => identity(e.first_name, e.last_name, e.date_of_birth)));
  const seenNumbers = new Map<string, number>();
  const seenPeople = new Map<string, number>();

  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const line = i + 2;
    const get = (col: string) => (cells[header.indexOf(col)] ?? "").trim();
    const errors: string[] = [];
    const lookup = (col: string, list: Lookup[], label: string) => {
      const v = get(col);
      if (!v) return null;
      const hit = find(list, v);
      if (!hit) errors.push(`Unknown ${label} “${v}”`);
      return hit?.id ?? null;
    };

    const gender = normalise(get("gender"));
    const genderValue = gender === "f" ? "female" : gender === "m" ? "male" : gender;
    const parsed = studentSchema.safeParse({
      studentNumber: get("student_number"),
      firstName: get("first_name"),
      middleName: get("middle_name"),
      lastName: get("last_name"),
      gender: genderValue,
      dateOfBirth: get("date_of_birth"),
      admissionDate: get("admission_date") || new Date().toISOString().slice(0, 10),
      residency: normalise(get("residency")) || "day",
    });
    if (!parsed.success) for (const issue of parsed.error.issues) errors.push(`${String(issue.path[0])}: ${issue.message}`);

    const classId = lookup("class", ctx.classes, "class");
    const programmeId = lookup("programme", ctx.programmes, "programme");
    const houseId = lookup("house", ctx.houses, "house");

    let guardian: ImportRow["guardian"];
    const gName = get("guardian_name");
    const gPhone = get("guardian_phone");
    if (gName || gPhone) {
      const rel = normalise(get("guardian_relationship")) || "guardian";
      const g = guardianSchema.safeParse({ fullName: gName, phone: gPhone, relationship: rel });
      if (!g.success) errors.push(`guardian: ${g.error.issues[0].message}`);
      else guardian = { full_name: g.data.fullName, phone: g.data.phone, relationship: g.data.relationship };
    }

    const label = `${get("first_name")} ${get("last_name")}`.trim() || `Row ${line}`;
    if (!parsed.success || errors.length) return { line, errors, label };

    const v = parsed.data;
    let duplicate: string | undefined;
    const num = v.studentNumber ? normalise(v.studentNumber) : null;
    const who = identity(v.firstName, v.lastName, v.dateOfBirth);
    if (num && existingNumbers.has(num)) duplicate = `Student number ${v.studentNumber} already exists`;
    else if (num && seenNumbers.has(num)) duplicate = `Same student number as row ${seenNumbers.get(num)}`;
    else if (existingPeople.has(who)) duplicate = "A student with the same name and date of birth already exists";
    else if (seenPeople.has(who)) duplicate = `Same name and date of birth as row ${seenPeople.get(who)}`;
    if (num) seenNumbers.set(num, line);
    seenPeople.set(who, line);

    return {
      line,
      errors,
      duplicate,
      label,
      guardian,
      data: { ...toStudentRow({ ...v, classId, programmeId, houseId }), ...(v.studentNumber ? { student_number: v.studentNumber } : {}) },
    };
  });
  return { rows };
}

export const fullName = (s: { first_name: string; middle_name?: string | null; last_name: string }) => [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
