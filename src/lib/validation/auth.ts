import { z } from "zod";

/** Strong password policy (configure the same minimum in Supabase Auth → Password settings). */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a symbol");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(128) });

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(160),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptPrivacy: z.literal("on", { message: "You must accept the privacy notice" }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string[] | undefined>; values?: Record<string, string | string[]> };

/** Echoes submitted values back so a failed submission does not wipe the form (React resets forms after actions). */
export function formValues(formData: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$") || /password/i.test(key)) continue;
    const all = formData.getAll(key).map(String);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

export function fieldErrors(error: z.ZodError): FormState {
  return { ok: false, errors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}
