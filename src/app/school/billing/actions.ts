"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { friendlyError } from "@/lib/billing";
import { publicEnv } from "@/lib/env";
import { confirmSubscriptionReference } from "@/lib/payments/complete";
import { initializeTransaction, isPaystackCheckoutUrl, isPaystackConfigured } from "@/lib/payments/paystack";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

/** Issues an invoice for the chosen plan. The amount (and any sponsorship) is worked out in the database. */
export async function choosePlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("billing.manage", { write: true });
  const v = z.object({ plan: z.string().regex(/^[a-z_]{2,30}$/), cycle: z.enum(["monthly", "annual"]) }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: "Choose a plan and billing period." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_subscription", { p_school: school.schoolId, p_plan_code: v.data.plan, p_cycle: v.data.cycle });
  if (error) return { ok: false, message: friendlyError(error.message, "Couldn't create the invoice.") };
  revalidatePath("/school/billing");
  return { ok: true, message: "Invoice created. If a sponsor covers it in full, your plan is already active." };
}

export async function cancelInvoice(formData: FormData) {
  await requireSchoolPermission("billing.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("invoiceId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("void_subscription_invoice", { p_invoice: id.data, p_reason: "Cancelled by the school" });
  revalidatePath("/school/billing");
}

/** Sends billing staff to Paystack for the full amount due; the plan activates only after server verification. */
export async function paySubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session } = await requireSchoolPermission("billing.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("invoiceId"));
  if (!id.success) return { ok: false, message: "Invoice not found." };
  if (!isPaystackConfigured()) return { ok: false, message: "Online payment isn't available yet. Pay by bank transfer and send the reference to support." };
  const supabase = await createClient();
  const reference = `AISHS-SUB-${randomUUID()}`;
  const { data: amount, error } = await supabase.rpc("create_subscription_intent", { p_invoice: id.data, p_reference: reference });
  if (error || amount == null) return { ok: false, message: friendlyError(error?.message, "Couldn't start the payment.") };
  let url: string;
  try {
    ({ authorizationUrl: url } = await initializeTransaction({
      email: session.email,
      amountGhs: Number(amount),
      reference,
      callbackUrl: `${publicEnv.siteUrl}/school/billing/callback`,
      metadata: { kind: "subscription", invoice_id: id.data, platform: "AI SHS Ghana" },
    }));
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!isPaystackCheckoutUrl(url)) return { ok: false, message: "Unexpected payment page. Please try again." };
  redirect(url);
}

/** Return from Paystack: re-verified server-side before the plan changes. */
export async function confirmSubscriptionReturn(reference: string) {
  if (!/^AISHS-SUB-[0-9a-f-]{36}$/i.test(reference)) return "failed" as const;
  const supabase = await createClient();
  const { data } = await supabase.from("subscription_payment_intents").select("id").eq("reference", reference).maybeSingle();
  if (!data) return "failed" as const; // RLS: only the payer (or platform finance) can read it
  return confirmSubscriptionReference(reference);
}
