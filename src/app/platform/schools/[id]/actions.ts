"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const input = z.object({
  schoolId: z.uuid(),
  decision: z.enum(["approve", "reject", "suspend", "reactivate"]),
  reason: z.string().trim().max(500).optional(),
});

export async function decideSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { schoolId, decision, reason } = parsed.data;

  await requirePlatformPermission(decision === "approve" || decision === "reject" ? "schools.verify" : "schools.suspend");
  if ((decision === "reject" || decision === "suspend") && !reason) return { ok: false, errors: { reason: ["Give a reason — it is shared with the school and recorded in the audit log."] } };

  const supabase = await createClient();
  const { error } =
    decision === "approve" || decision === "reject"
      ? await supabase.rpc("review_school", { p_school: schoolId, p_decision: decision, p_reason: reason ?? null })
      : await supabase.rpc("set_school_status", { p_school: schoolId, p_status: decision === "suspend" ? "suspended" : "active", p_reason: reason ?? null });
  if (error) return { ok: false, message: friendlyDbError(error.message, error.message) };

  revalidatePath(`/platform/schools/${schoolId}`);
  revalidatePath("/platform", "layout");
  const done = { approve: "School verified and activated.", reject: "Registration rejected.", suspend: "School suspended.", reactivate: "School reactivated." }[decision];
  return { ok: true, message: done };
}
