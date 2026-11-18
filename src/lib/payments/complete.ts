import "server-only";

import { guardianUsers, notifyUsers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

import { verifyTransaction } from "./paystack";

/**
 * Re-verifies a Paystack reference with Paystack and records the payment (idempotent).
 * Used by both the webhook and the redirect back from checkout.
 */
export async function confirmPaystackReference(reference: string): Promise<"succeeded" | "pending" | "failed"> {
  const admin = createAdminClient();
  const { data: intent } = await admin.from("payment_intents").select("id, status, school_id, student_id, amount").eq("reference", reference).maybeSingle();
  if (!intent) return "failed";
  if (intent.status === "succeeded") return "succeeded";
  const v = await verifyTransaction(reference);
  if (!v.ok) {
    if (["failed", "abandoned", "reversed"].includes(v.status)) await admin.from("payment_intents").update({ status: v.status === "abandoned" ? "abandoned" : "failed" }).eq("id", intent.id);
    return v.status === "ongoing" || v.status === "pending" ? "pending" : "failed";
  }
  const { error } = await admin.rpc("complete_online_payment", { p_reference: reference, p_amount: v.amountGhs, p_provider_reference: v.id });
  if (error) return "failed";
  await notifyUsers({
    schoolId: intent.school_id,
    userIds: await guardianUsers([intent.student_id]),
    category: "payments",
    title: "Payment received",
    body: `We received GH₵${Number(intent.amount).toFixed(2)}. Your receipt is in the parent portal.`,
    link: "/parent",
  });
  return "succeeded";
}

/** Same for platform subscription payments (references start with AISHS-SUB-). */
export async function confirmSubscriptionReference(reference: string): Promise<"succeeded" | "pending" | "failed"> {
  const admin = createAdminClient();
  const { data: intent } = await admin.from("subscription_payment_intents").select("id, status").eq("reference", reference).maybeSingle();
  if (!intent) return "failed";
  if (intent.status === "succeeded") return "succeeded";
  if (intent.status === "failed") return "failed";
  const v = await verifyTransaction(reference);
  if (!v.ok) {
    if (["failed", "abandoned", "reversed"].includes(v.status)) await admin.from("subscription_payment_intents").update({ status: v.status === "abandoned" ? "abandoned" : "failed" }).eq("id", intent.id);
    return v.status === "ongoing" || v.status === "pending" ? "pending" : "failed";
  }
  const { data, error } = await admin.rpc("complete_subscription_payment", { p_reference: reference, p_amount: v.amountGhs, p_provider_reference: v.id });
  return error || !data ? "failed" : "succeeded";
}

/** Routes a verified Paystack reference to fee or subscription completion. */
export const confirmAnyReference = (reference: string) =>
  reference.startsWith("AISHS-SUB-") ? confirmSubscriptionReference(reference) : confirmPaystackReference(reference);
