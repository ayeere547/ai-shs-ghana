"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { SCHOOL_ROLES } from "@/lib/auth/permissions";
import { requireSchoolPermission } from "@/lib/auth/session";
import { publicEnv, serverEnv } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError, memberInviteSchema } from "@/lib/validation/school";

/**
 * Adds a person to the current school. Existing accounts are linked directly; new people receive a
 * Supabase invitation email (service role — used only after the permission and rank checks below)
 * and are linked once their account row exists. The database re-checks every rule in add_school_member().
 */
export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, school } = await requireSchoolPermission("members.manage", { write: true });
  const parsed = memberInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const { email, fullName, role } = parsed.data;

  const roleDef = SCHOOL_ROLES.find((r) => r.key === role);
  if (!roleDef || roleDef.rank > school.rank) return { ok: false, errors: { role: ["You can't assign a role above your own."] }, values: formValues(formData) };
  if (email === session.email.toLowerCase()) return { ok: false, errors: { email: ["You are already a member."] } };

  const ip = await clientIp();
  if (!rateLimit(`invite:${session.userId}:${ip}`, 60, 60 * 60_000).ok) return { ok: false, message: "Too many invitations in a short time. Try again later." };

  const supabase = await createClient();
  let { error } = await supabase.rpc("add_school_member", { p_school: school.schoolId, p_email: email, p_role: role });

  if (error && /no_account/.test(error.message)) {
    if (!serverEnv().serviceRoleKey) return { ok: false, message: "No account uses that email, and email invitations aren't configured on this server (SUPABASE_SERVICE_ROLE_KEY)." };
    const admin = createAdminClient();
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password`,
    });
    if (inviteError) return { ok: false, message: "The invitation email could not be sent. Check the address and try again.", values: formValues(formData) };
    ({ error } = await supabase.rpc("add_school_member", { p_school: school.schoolId, p_email: email, p_role: role }));
    if (!error) {
      revalidatePath("/school", "layout");
      return { ok: true, message: `Invitation sent to ${email}. They'll set a password from the email and then see ${school.schoolName}.` };
    }
  }
  if (error) return { ok: false, message: friendlyDbError(error.message), values: formValues(formData) };

  revalidatePath("/school", "layout");
  return { ok: true, message: `${email} has been added as ${roleDef.label}.` };
}

const updateSchema = z.object({
  membershipId: z.uuid(),
  role: z.string().max(40).optional(),
  status: z.enum(["active", "removed"]).optional(),
});

export async function updateMember(formData: FormData) {
  await requireSchoolPermission("members.manage", { write: true });
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc("update_school_member", { p_membership: parsed.data.membershipId, p_role: parsed.data.role || null, p_status: parsed.data.status ?? null });
  revalidatePath("/school", "layout");
}
