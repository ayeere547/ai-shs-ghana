"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { confirmPaystackReference } from "@/lib/payments/complete";
import { initializeTransaction, isPaystackConfigured } from "@/lib/payments/paystack";
import { requireChild } from "@/lib/parent";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

/** Starts a Paystack checkout for part or all of an invoice balance. Completion happens only after server verification. */
export async function startOnlinePayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = z.object({ studentId: z.uuid(), invoiceId: z.uuid(), amount: z.coerce.number().min(1, "Enter at least GH₵1").max(1000000) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };
  const { session, child } = await requireChild(input.data.studentId);
  if (!isPaystackConfigured()) return { ok: false, message: "Online payments aren't available yet. Please pay at the school." };

  const supabase = await createClient();
  const { data: settings } = await supabase.from("school_payment_settings").select("online_payments_enabled, paystack_subaccount").eq("school_id", child.school_id).maybeSingle();
  if (!settings?.online_payments_enabled || !settings.paystack_subaccount) return { ok: false, message: "Your school doesn't accept online payments yet. Please pay at the school." };

  const reference = `AISHS-${randomUUID()}`;
  const amount = Math.round(input.data.amount * 100) / 100;
  const { error } = await supabase.rpc("create_payment_intent", { p_invoice: input.data.invoiceId, p_amount: amount, p_reference: reference });
  if (error) return { ok: false, message: /balance|not open|online payments/.test(error.message) ? error.message : "Couldn't start the payment." };

  let url: string;
  try {
    ({ authorizationUrl: url } = await initializeTransaction({
      email: session.email,
      amountGhs: amount,
      reference,
      subaccount: settings.paystack_subaccount,
      callbackUrl: `${publicEnv.siteUrl}/parent/payments/callback`,
      metadata: { invoice_id: input.data.invoiceId, student_id: input.data.studentId, platform: "AI SHS Ghana" },
    }));
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!/^https:\/\/([a-z0-9-]+\.)*paystack\.(com|co)\//i.test(url)) return { ok: false, message: "Unexpected payment page. Please try again." };
  redirect(url);
}

/** Paystack sends the parent back here; the payment is re-verified with Paystack before it counts. */
export async function confirmReturn(reference: string) {
  if (!/^AISHS-[0-9a-f-]{36}$/i.test(reference)) return "failed" as const;
  const supabase = await createClient();
  const { data: intent } = await supabase.from("payment_intents").select("student_id").eq("reference", reference).maybeSingle();
  if (!intent) return "failed" as const; // RLS: only the payer can read their own intent
  const status = await confirmPaystackReference(reference);
  return { status, studentId: intent.student_id as string };
}
