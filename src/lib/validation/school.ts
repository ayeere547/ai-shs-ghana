import { z } from "zod";

import { REGION_CODES } from "@/lib/ghana";

import { emailSchema } from "./auth";

/** Optional text: absent, empty or whitespace-only input all become undefined. */
const blank = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);
const optional = (schema: z.ZodType<string, string>) => blank.pipe(schema.optional());

export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Enter a valid phone number")
  .max(32)
  .regex(/^[+0-9 ()-]+$/, "Use digits, spaces and + only");

const websiteSchema = blank
  .transform((v) => (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v))
  .pipe(z.url({ protocol: /^https?$/, message: "Enter a valid website address" }).max(200).optional());

export const schoolRegistrationSchema = z.object({
  name: z.string().trim().min(3, "Enter the official school name").max(160),
  schoolCode: optional(z.string().max(32).regex(/^[A-Za-z0-9/ -]+$/, "Use letters, numbers, / and - only")),
  category: z.enum(["unclassified", "A", "B", "C", "D", "E"]),
  ownership: z.enum(["public", "private"], { message: "Choose public or private" }),
  boardingType: z.enum(["day", "boarding", "day_and_boarding"], { message: "Choose day, boarding or both" }),
  regionCode: z.enum(REGION_CODES, { message: "Choose a region" }),
  district: z.string().trim().min(2, "Enter the district").max(120),
  address: z.string().trim().min(5, "Enter the physical or postal address").max(300),
  email: emailSchema,
  phone: phoneSchema,
  website: websiteSchema,
  headmasterName: z.string().trim().min(3, "Enter the headteacher's name").max(160),
  headmasterEmail: blank.pipe(emailSchema.optional()),
  headmasterPhone: blank.pipe(phoneSchema.optional()),
  programmes: z.array(z.string().trim().min(2).max(80)).min(1, "Select at least one programme").max(20),
  description: optional(z.string().max(1000)),
  registrantRole: z.enum(["headteacher", "school_admin"]),
  confirmAuthority: z.literal("on", { message: "Confirm you are authorised to register this school" }),
});

export type SchoolRegistration = z.infer<typeof schoolRegistrationSchema>;

/** Reads the registration form, merging the checkbox list with comma-separated "other" programmes. */
export function parseRegistrationForm(formData: FormData) {
  const other = String(formData.get("otherProgrammes") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const programmes = [...new Set([...formData.getAll("programmes").map(String), ...other])];
  return schoolRegistrationSchema.safeParse({ ...Object.fromEntries(formData), programmes });
}

/** Maps the validated form to the register_school() RPC payload. */
export function toRegistrationPayload(v: SchoolRegistration) {
  return {
    name: v.name,
    school_code: v.schoolCode ?? null,
    category: v.category,
    ownership: v.ownership,
    boarding_type: v.boardingType,
    region_code: v.regionCode,
    district: v.district,
    address: v.address,
    email: v.email,
    phone: v.phone,
    website: v.website ?? null,
    headmaster_name: v.headmasterName,
    headmaster_email: v.headmasterEmail ?? null,
    headmaster_phone: v.headmasterPhone ?? null,
    programmes_offered: v.programmes,
    description: v.description ?? null,
    registrant_role: v.registrantRole,
  };
}

export const schoolProfileSchema = z.object({
  address: z.string().trim().min(5, "Enter the address").max(300),
  district: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema,
  website: websiteSchema,
  headmasterName: z.string().trim().min(3).max(160),
  description: optional(z.string().max(1000)),
  publicListing: z.literal("on").optional(),
});

export const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #0b2545");

export const brandingSchema = z.object({
  primaryColor: hexColour,
  secondaryColor: hexColour,
  motto: optional(z.string().max(160)),
});

export const schoolSettingsSchema = z.object({
  formLevels: z.coerce.number().int().min(1).max(6),
  periodMinutes: z.coerce.number().int().min(20).max(180),
  schoolDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one school day"),
  parentPortal: z.literal("on").optional(),
  studentPortal: z.literal("on").optional(),
});

export const memberInviteSchema = z.object({
  email: emailSchema,
  fullName: optional(z.string().min(2).max(160)),
  role: z.string().min(2).max(40),
});

/** Maps known database errors from the RPCs to messages safe to show users. */
export function friendlyDbError(message: string | undefined, fallback = "Something went wrong. Please try again.") {
  if (!message) return fallback;
  if (/school with this code/i.test(message)) return "A school with this code is already registered. Contact support if you believe this is a mistake.";
  if (/awaiting verification/i.test(message)) return message;
  if (/temporarily closed/i.test(message)) return message;
  if (/already_member/.test(message)) return "That person is already a member of this school.";
  if (/above your own|ranked above you/.test(message)) return "You can't assign or change a role ranked above your own.";
  if (/your own/.test(message)) return "You can't change your own access. Ask another administrator.";
  if (/reason is required/.test(message)) return "Please give a reason.";
  if (/permission denied|row-level security/i.test(message)) return "You don't have permission to do that.";
  if (/duplicate key|unique/i.test(message)) return "An item with that name already exists.";
  if (/check constraint/i.test(message)) return "Some values are not valid. Check dates and numbers.";
  return fallback;
}
