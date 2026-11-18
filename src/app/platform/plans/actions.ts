"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformPermission } from "@/lib/auth/session";
import { friendlyError } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

const money = z.string().trim().regex(/^(\d{1,7}(\.\d{1,2})?)?$/, "Enter an amount like 250 or 250.00");
const limit = z.string().trim().regex(/^\d{0,8}$/, "Use a whole number, or leave blank for unlimited");
const num = (v: string) => (v === "" ? null : Number(v));

/** Prices, limits and features. The database audits every change and keeps the Free plan free. */
export async function savePlan(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("plans.manage");
  const v = z.object({
    id: z.uuid(), name: z.string().trim().min(2).max(60), description: z.string().trim().max(300),
    monthly: money, annual: money, maxStudents: limit, maxStaff: limit, aiRequests: limit,
    features: z.string().max(3000), visibility: z.enum(["public", "hidden", "retired"]),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const d = v.data;
  const features = d.features.split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 20);
  if (features.some((f) => f.length > 120)) return { ok: false, message: "Keep each feature under 120 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("subscription_plans").update({
    name: d.name, description: d.description || null, price_monthly_ghs: num(d.monthly), price_annual_ghs: num(d.annual),
    limits: { max_students: num(d.maxStudents), max_staff: num(d.maxStaff), ai_requests_per_month: num(d.aiRequests) },
    features, is_public: d.visibility === "public", is_active: d.visibility !== "retired",
  }).eq("id", d.id);
  if (error) return { ok: false, message: friendlyError(error.message, "Couldn't save the plan.") };
  revalidatePath("/platform/plans");
  revalidatePath("/pricing");
  return { ok: true, message: "Plan saved." };
}
