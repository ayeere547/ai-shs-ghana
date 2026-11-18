import { z } from "zod";

/**
 * Config-driven CRUD for a school's academic structure tables. Every definition is plain data
 * (serialisable to client forms); the server builds a zod schema from it, always sets school_id
 * from the verified school context, and RLS enforces `academics.manage` on every write.
 */
export type FieldType = "text" | "textarea" | "number" | "date" | "time" | "select" | "checkbox";

export type ResourceField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  optionsFrom?: ResourceKey;
  hint?: string;
  hideInList?: boolean;
};

export type ResourceDef = {
  key: ResourceKey;
  table: string;
  singular: string;
  plural: string;
  description: string;
  orderBy: { column: string; ascending: boolean }[];
  fields: ResourceField[];
  /** Ensures at most one row is flagged current (mirrors a partial unique index). */
  exclusiveFlag?: string;
};

export type ResourceKey = "years" | "terms" | "departments" | "programmes" | "classes" | "subjects" | "houses" | "periods";

export const RESOURCES: Record<ResourceKey, ResourceDef> = {
  years: {
    key: "years",
    table: "academic_years",
    singular: "academic year",
    plural: "Academic years",
    description: "The school year, e.g. 2026/2027. Mark one as current.",
    orderBy: [{ column: "starts_on", ascending: false }],
    exclusiveFlag: "is_current",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 40, hint: "e.g. 2026/2027" },
      { name: "starts_on", label: "Starts", type: "date", required: true },
      { name: "ends_on", label: "Ends", type: "date", required: true },
      { name: "is_current", label: "Current year", type: "checkbox" },
    ],
  },
  terms: {
    key: "terms",
    table: "academic_terms",
    singular: "term",
    plural: "Terms",
    description: "Terms or semesters within an academic year. Mark one as current.",
    orderBy: [{ column: "starts_on", ascending: true }],
    exclusiveFlag: "is_current",
    fields: [
      { name: "academic_year_id", label: "Academic year", type: "select", required: true, optionsFrom: "years" },
      { name: "name", label: "Name", type: "text", required: true, max: 40, hint: "e.g. Term 1" },
      { name: "starts_on", label: "Starts", type: "date", required: true },
      { name: "ends_on", label: "Ends", type: "date", required: true },
      { name: "is_current", label: "Current term", type: "checkbox" },
    ],
  },
  departments: {
    key: "departments",
    table: "school_departments",
    singular: "department",
    plural: "Departments",
    description: "Academic departments, e.g. Science, Languages.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      { name: "code", label: "Code", type: "text", max: 16 },
    ],
  },
  programmes: {
    key: "programmes",
    table: "school_programmes",
    singular: "programme",
    plural: "Programmes",
    description: "Programmes the school offers, e.g. General Science, Business.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      { name: "code", label: "Code", type: "text", max: 16 },
      { name: "description", label: "Description", type: "textarea", max: 500, hideInList: true },
    ],
  },
  classes: {
    key: "classes",
    table: "school_classes",
    singular: "class",
    plural: "Classes",
    description: "Class groups by form level. Use your school's own naming, e.g. 1 Science A.",
    orderBy: [
      { column: "form_level", ascending: true },
      { column: "name", ascending: true },
    ],
    fields: [
      { name: "name", label: "Class name", type: "text", required: true, max: 40 },
      { name: "form_level", label: "Form", type: "number", required: true, min: 1, max: 6 },
      { name: "programme_id", label: "Programme", type: "select", optionsFrom: "programmes" },
      { name: "capacity", label: "Capacity", type: "number", min: 1, max: 500 },
    ],
  },
  subjects: {
    key: "subjects",
    table: "school_subjects",
    singular: "subject",
    plural: "Subjects",
    description: "Core and elective subjects taught at the school.",
    orderBy: [
      { column: "is_core", ascending: false },
      { column: "name", ascending: true },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      { name: "code", label: "Code", type: "text", max: 16 },
      { name: "department_id", label: "Department", type: "select", optionsFrom: "departments" },
      { name: "is_core", label: "Core subject", type: "checkbox" },
    ],
  },
  periods: {
    key: "periods",
    table: "timetable_periods",
    singular: "period",
    plural: "Periods",
    description: "The school day: lesson periods and breaks, in order. Used by the timetable.",
    orderBy: [{ column: "starts_at", ascending: true }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 40, hint: "e.g. Period 1, Break" },
      { name: "starts_at", label: "Starts", type: "time", required: true },
      { name: "ends_at", label: "Ends", type: "time", required: true },
      { name: "is_break", label: "Break (no lessons)", type: "checkbox" },
    ],
  },
  houses: {
    key: "houses",
    table: "school_houses",
    singular: "house",
    plural: "Houses",
    description: "Houses used for boarding and student life.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      {
        name: "gender",
        label: "Residents",
        type: "select",
        required: true,
        options: [
          { value: "mixed", label: "Mixed" },
          { value: "boys", label: "Boys" },
          { value: "girls", label: "Girls" },
        ],
      },
    ],
  },
};

export const isResourceKey = (v: unknown): v is ResourceKey => typeof v === "string" && v in RESOURCES;

const uuid = z.uuid("Choose a valid option");

/** Builds the server-side validator for a resource from its field definitions. */
export function resourceSchema(def: ResourceDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    let s: z.ZodType;
    switch (f.type) {
      case "checkbox":
        s = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
        break;
      case "number": {
        const n = z.coerce.number({ message: `${f.label} must be a number` }).int(`${f.label} must be a whole number`).min(f.min ?? 0).max(f.max ?? 1_000_000);
        s = f.required ? n : z.preprocess((v) => (v === "" || v == null ? null : v), n.nullable());
        break;
      }
      case "time":
        s = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, `Enter a valid ${f.label.toLowerCase()} time`).transform((v) => v.slice(0, 5));
        break;
      case "date": {
        const d = z.iso.date({ message: `Enter a valid ${f.label.toLowerCase()} date` });
        s = f.required ? d : z.preprocess((v) => (v === "" ? null : v), d.nullable());
        break;
      }
      case "select": {
        const inner = f.options ? z.enum(f.options.map((o) => o.value) as [string, ...string[]]) : uuid;
        s = f.required ? inner : z.preprocess((v) => (v === "" || v == null ? null : v), inner.nullable());
        break;
      }
      default: {
        const t = z.string().trim().max(f.max ?? 200, `${f.label} is too long`);
        s = f.required ? t.min(1, `Enter the ${f.label.toLowerCase()}`) : t.transform((v) => v || null);
      }
    }
    shape[f.name] = s;
  }
  let schema: z.ZodType = z.object(shape);
  if (def.fields.some((f) => f.name === "starts_at") && def.fields.some((f) => f.name === "ends_at")) {
    schema = (schema as z.ZodObject).refine((v: Record<string, unknown>) => String(v.ends_at) > String(v.starts_at), { path: ["ends_at"], message: "The end time must be after the start time" });
  }
  if (def.fields.some((f) => f.name === "starts_on") && def.fields.some((f) => f.name === "ends_on")) {
    schema = (schema as z.ZodObject).refine((v: Record<string, unknown>) => !v.starts_on || !v.ends_on || String(v.ends_on) > String(v.starts_on), {
      path: ["ends_on"],
      message: "The end date must be after the start date",
    });
  }
  return schema as z.ZodType<Record<string, unknown>>;
}

/** Collects form values for a resource (unchecked checkboxes are absent from FormData). */
export function readResourceForm(def: ResourceDef, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const f of def.fields) raw[f.name] = f.type === "checkbox" ? formData.get(f.name) === "on" : (formData.get(f.name) ?? "");
  return raw;
}
