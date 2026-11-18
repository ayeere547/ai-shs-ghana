"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePlatformPermission("platform.settings.manage");
  const v = z.object({ maxPending: z.coerce.number().int().min(1, "At least 1").max(20, "At most 20") }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const open = formData.get("registrationOpen") === "on";
  const supabase = await createClient();
  const results = await Promise.all([
    supabase.from("platform_settings").update({ value: open, updated_by: session.userId }).eq("key", "registration_open"),
    supabase.from("platform_settings").update({ value: v.data.maxPending, updated_by: session.userId }).eq("key", "max_pending_registrations_per_user"),
  ]);
  if (results.some((r) => r.error)) return { ok: false, message: "Couldn't save settings." };
  await supabase.rpc("log_audit", { p_action: "platform.settings_changed", p_entity_type: "platform_settings", p_summary: `School registration ${open ? "open" : "closed"}; ${v.data.maxPending} pending per user`, p_metadata: { registration_open: open, max_pending: v.data.maxPending } });
  revalidatePath("/platform/settings");
  return { ok: true, message: "Settings saved." };
}
