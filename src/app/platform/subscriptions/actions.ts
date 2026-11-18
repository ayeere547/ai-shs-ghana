"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformPermission } from "@/lib/auth/session";
import { friendlyError } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

const done = (schoolId?: string, message = "Saved."): FormState => {
  revalidatePath("/platform/subscriptions");
  if (schoolId) revalidatePath(`/platform/schools/${schoolId}`);
  return { ok: true, message };
};
const fail = (message: string | undefined, fallback: string): FormState => ({ ok: false, message: friendlyError(message, fallback) });
const optDate = z.union([z.iso.date(), z.literal("")]).optional();

export async function saveSponsor(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({
    id: z.union([z.uuid(), z.literal("")]).optional(),
    name: z.string().trim().min(2, "Enter the sponsor's name").max(120),
    kind: z.enum(["government", "ngo", "alumni", "corporate", "religious", "individual", "other"]),
    contact_name: z.string().trim().max(120).optional(),
    contact_email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
    contact_phone: z.string().trim().max(30).optional(),
    notes: z.string().trim().max(1000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const { id, ...row } = v.data;
  const clean = { ...row, contact_name: row.contact_name || null, contact_email: row.contact_email || null, contact_phone: row.contact_phone || null, notes: row.notes || null, is_active: formData.get("is_active") !== "off" };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("sponsors").update(clean).eq("id", id) : await supabase.from("sponsors").insert(clean);
  if (error) return fail(error.code === "23505" ? "A sponsor with that name already exists." : undefined, "Couldn't save the sponsor.");
  return done(undefined, id ? "Sponsor updated." : "Sponsor added.");
}

export async function setSponsorship(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({
    schoolId: z.uuid(), sponsorId: z.uuid("Choose a sponsor"), plan: z.string().regex(/^[a-z_]{2,30}$/),
    percent: z.coerce.number().gt(0, "Coverage must be above 0%").max(100, "Coverage can't exceed 100%"),
    startsOn: optDate, endsOn: optDate, notes: z.string().trim().max(1000).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_sponsorship", {
    p_sponsor: v.data.sponsorId, p_school: v.data.schoolId, p_plan_code: v.data.plan, p_percent: v.data.percent,
    p_starts: v.data.startsOn || null, p_ends: v.data.endsOn || null, p_notes: v.data.notes ?? null,
  });
  if (error) return fail(error.message, "Couldn't save the sponsorship.");
  return done(v.data.schoolId, "Sponsorship saved. Issue an invoice to apply it.");
}

export async function endSponsorship(formData: FormData) {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({ id: z.uuid(), schoolId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const supabase = await createClient();
  await supabase.rpc("end_sponsorship", { p_sponsorship: v.data.id, p_reason: "Ended by platform staff" });
  done(v.data.schoolId);
}

export async function assignPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({
    schoolId: z.uuid(), plan: z.string().regex(/^[a-z_]{2,30}$/), cycle: z.enum(["none", "monthly", "annual"]),
    periodEnd: optDate, funding: z.enum(["self_funded", "sponsored", "subsidised", "institution_funded"]),
    reason: z.string().trim().min(3, "Give a reason (kept in the audit log)").max(300),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_plan", { p_school: v.data.schoolId, p_plan_code: v.data.plan, p_cycle: v.data.cycle, p_period_end: v.data.periodEnd || null, p_funding: v.data.funding, p_reason: v.data.reason });
  if (error) return fail(error.message, "Couldn't change the plan.");
  return done(v.data.schoolId, "Plan updated.");
}

export async function issueInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({ schoolId: z.uuid(), plan: z.string().regex(/^[a-z_]{2,30}$/), cycle: z.enum(["monthly", "annual"]) }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: "Choose a plan and billing period." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_subscription", { p_school: v.data.schoolId, p_plan_code: v.data.plan, p_cycle: v.data.cycle });
  if (error) return fail(error.message, "Couldn't issue the invoice.");
  return done(v.data.schoolId, "Invoice issued (settled at once if fully sponsored).");
}

export async function recordPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({
    schoolId: z.uuid(), invoiceId: z.uuid(), method: z.enum(["bank_transfer", "mobile_money", "cheque", "waived"]),
    reference: z.string().trim().min(2, "Enter the payment reference (or why it's waived)").max(120),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_subscription_payment", { p_invoice: v.data.invoiceId, p_method: v.data.method, p_reference: v.data.reference });
  if (error) return fail(error.message, "Couldn't record the payment.");
  return done(v.data.schoolId, "Payment recorded — the plan is active.");
}

export async function voidInvoice(formData: FormData) {
  await requirePlatformPermission("subscriptions.manage");
  const v = z.object({ invoiceId: z.uuid(), schoolId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const supabase = await createClient();
  await supabase.rpc("void_subscription_invoice", { p_invoice: v.data.invoiceId, p_reason: "Cancelled by platform staff" });
  done(v.data.schoolId);
}
