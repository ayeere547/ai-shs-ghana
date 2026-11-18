"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PLATFORM_ROLES } from "@/lib/auth/permissions";
import { requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, fieldErrors, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const grantSchema = z.object({
  email: emailSchema,
  role: z.enum(PLATFORM_ROLES.map((r) => r.key) as [string, ...string[]]),
});

export async function grantPlatformRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("platform.users.manage");
  const parsed = grantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_platform_role", { p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) {
    if (/no_account/.test(error.message)) return { ok: false, errors: { email: ["No account uses this email. Ask them to create an account first."] } };
    return { ok: false, message: friendlyDbError(error.message) };
  }
  revalidatePath("/platform/users");
  return { ok: true, message: `Platform access granted to ${parsed.data.email}.` };
}

export async function revokePlatformRole(formData: FormData) {
  await requirePlatformPermission("platform.users.manage");
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return;
  const supabase = await createClient();
  await supabase.rpc("revoke_platform_role", { p_user: userId.data });
  revalidatePath("/platform/users");
}
