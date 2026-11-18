import { z } from "zod";

import type { SchoolPermission } from "@/lib/auth/permissions";

/**
 * Config-driven CRUD for simple school-owned tables. Every definition is plain data (serialisable
 * to client forms); the server builds a zod schema from it, always sets school_id from the verified
 * school context, checks the resource's permission, and RLS enforces the same rule on every write.
 */
export type FieldType = "text" | "textarea" | "number" | "money" | "date" | "time" | "select" | "checkbox";

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
  /** Set on create only (e.g. opening stock); hidden when editing. */
  createOnly?: boolean;
  /** Column heading in lists, when different from the form label. */
  listLabel?: string;
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
  /** Permission needed to create, edit and delete (default academics.manage). */
  permission?: SchoolPermission;
  /** Page to refresh after changes (default /school). */
  revalidate?: string;
};

export type ResourceKey =
  | "years" | "terms" | "departments" | "programmes" | "classes" | "subjects" | "houses" | "periods"
  | "fees" | "expenditure" | "budgets" | "dormitories" | "rooms" | "books" | "stock" | "assets";

const EXPENSE_CATEGORIES = [
  { value: "salaries", label: "Salaries" }, { value: "utilities", label: "Utilities" }, { value: "feeding", label: "Feeding" },
  { value: "maintenance", label: "Maintenance" }, { value: "teaching_materials", label: "Teaching materials" }, { value: "transport", label: "Transport" },
  { value: "administration", label: "Administration" }, { value: "boarding", label: "Boarding" }, { value: "sports", label: "Sports" }, { value: "other", label: "Other" },
];

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
  fees: {
    key: "fees", table: "fee_items", singular: "fee item", plural: "Fee items", permission: "finance.manage", revalidate: "/school/finance",
    description: "Charges billed each term. Leave the filters blank to apply a fee to every student; use them for form-, programme- or boarding-specific fees.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 120 },
      { name: "amount", label: "Amount (GH₵)", type: "money", required: true, max: 1000000 },
      { name: "term_id", label: "Only for term", type: "select", optionsFrom: "terms" },
      { name: "form_level", label: "Only for form", type: "number", min: 1, max: 6 },
      { name: "programme_id", label: "Only for programme", type: "select", optionsFrom: "programmes" },
      { name: "residency", label: "Only for", type: "select", options: [{ value: "day", label: "Day students" }, { value: "boarding", label: "Boarders" }] },
      { name: "is_active", label: "Active", type: "checkbox" },
    ],
  },
  expenditure: {
    key: "expenditure", table: "expenditure_records", singular: "expense", plural: "Expenditure", permission: "finance.manage", revalidate: "/school/finance",
    description: "Money the school has spent.",
    orderBy: [{ column: "spent_on", ascending: false }],
    fields: [
      { name: "spent_on", label: "Date", type: "date", required: true },
      { name: "category", label: "Category", type: "select", required: true, options: EXPENSE_CATEGORIES },
      { name: "description", label: "Description", type: "text", required: true, max: 200 },
      { name: "amount", label: "Amount (GH₵)", type: "money", required: true, max: 10000000 },
      { name: "payee", label: "Paid to", type: "text", max: 120 },
      { name: "reference", label: "Reference", type: "text", max: 120, hideInList: true },
    ],
  },
  budgets: {
    key: "budgets", table: "school_budgets", singular: "budget line", plural: "Budgets", permission: "finance.manage", revalidate: "/school/finance",
    description: "Planned spending per category for an academic year.",
    orderBy: [{ column: "category", ascending: true }],
    fields: [
      { name: "academic_year_id", label: "Academic year", type: "select", required: true, optionsFrom: "years" },
      { name: "category", label: "Category", type: "select", required: true, options: EXPENSE_CATEGORIES },
      { name: "amount", label: "Budget (GH₵)", type: "money", required: true, max: 100000000 },
    ],
  },
  dormitories: {
    key: "dormitories", table: "dormitories", singular: "dormitory", plural: "Dormitories", permission: "boarding.manage", revalidate: "/school/boarding",
    description: "Boarding dormitories.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 80 },
      { name: "gender", label: "For", type: "select", required: true, options: [{ value: "boys", label: "Boys" }, { value: "girls", label: "Girls" }, { value: "mixed", label: "Mixed" }] },
      { name: "house_id", label: "House", type: "select", optionsFrom: "houses" },
    ],
  },
  rooms: {
    key: "rooms", table: "dorm_rooms", singular: "room", plural: "Rooms", permission: "boarding.manage", revalidate: "/school/boarding",
    description: "Rooms and the number of beds in each.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "dormitory_id", label: "Dormitory", type: "select", required: true, optionsFrom: "dormitories" },
      { name: "name", label: "Room", type: "text", required: true, max: 40 },
      { name: "beds", label: "Beds", type: "number", required: true, min: 1, max: 200 },
    ],
  },
  books: {
    key: "books", table: "library_books", singular: "book", plural: "Books", permission: "library.circulation", revalidate: "/school/books",
    description: "Physical books in the school library.",
    orderBy: [{ column: "title", ascending: true }],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "author", label: "Author", type: "text", max: 160 },
      { name: "isbn", label: "ISBN", type: "text", max: 17, hideInList: true },
      { name: "subject_id", label: "Subject", type: "select", optionsFrom: "subjects" },
      { name: "copies", label: "Copies", type: "number", required: true, min: 0, max: 2000 },
      { name: "shelf", label: "Shelf", type: "text", max: 40 },
    ],
  },
  stock: {
    key: "stock", table: "inventory_items", singular: "stock item", plural: "Stores", permission: "inventory.manage", revalidate: "/school/inventory",
    description: "Consumable stock. After creating an item, change quantities with stock movements so every change is recorded.",
    orderBy: [{ column: "name", ascending: true }],
    fields: [
      { name: "name", label: "Item", type: "text", required: true, max: 120 },
      { name: "category", label: "Category", type: "select", required: true, options: ["general", "stationery", "food", "cleaning", "laboratory", "sports", "medical", "uniform", "other"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      { name: "unit", label: "Unit", type: "text", required: true, max: 20, hint: "e.g. pieces, boxes, bags" },
      { name: "quantity", label: "Opening stock", listLabel: "In stock", type: "money", required: true, max: 10000000, createOnly: true },
      { name: "reorder_level", label: "Reorder at", type: "money", required: true, max: 10000000 },
      { name: "location", label: "Location", type: "text", max: 80, hideInList: true },
    ],
  },
  assets: {
    key: "assets", table: "school_assets", singular: "asset", plural: "Assets", permission: "inventory.manage", revalidate: "/school/inventory",
    description: "Tagged equipment, furniture and other school property.",
    orderBy: [{ column: "tag", ascending: true }],
    fields: [
      { name: "tag", label: "Asset tag", type: "text", required: true, max: 40 },
      { name: "name", label: "Name", type: "text", required: true, max: 120 },
      { name: "category", label: "Category", type: "select", required: true, options: ["equipment", "furniture", "ict", "laboratory", "vehicle", "building", "sports", "other"].map((v) => ({ value: v, label: v === "ict" ? "ICT" : v[0].toUpperCase() + v.slice(1) })) },
      { name: "location", label: "Location", type: "text", max: 80 },
      { name: "condition", label: "Condition", type: "select", required: true, options: ["new", "good", "fair", "poor", "broken", "disposed"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      { name: "acquired_on", label: "Acquired", type: "date", hideInList: true },
      { name: "value", label: "Value (GH₵)", type: "money", max: 100000000, hideInList: true },
    ],
  },
};

export const isResourceKey = (v: unknown): v is ResourceKey => typeof v === "string" && v in RESOURCES;

const uuid = z.uuid("Choose a valid option");

/** Builds the server-side validator for a resource from its field definitions. */
export function resourceSchema(def: ResourceDef, editing = false) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fieldsFor(def, editing)) {
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
      case "money": {
        const m = z.coerce.number({ message: `${f.label} must be an amount` }).min(f.min ?? 0).max(f.max ?? 100000000).transform((v) => Math.round(v * 100) / 100);
        s = f.required ? m : z.preprocess((v) => (v === "" || v == null ? null : v), m.nullable());
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

/** Fields that apply to this operation (create-only fields are left out when editing). */
export const fieldsFor = (def: ResourceDef, editing: boolean) => (editing ? def.fields.filter((f) => !f.createOnly) : def.fields);

export const formatMoney = (v: unknown) => `GH₵ ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
