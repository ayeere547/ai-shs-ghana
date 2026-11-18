import { redirect } from "next/navigation";

import { confirmSubscriptionReturn } from "@/app/school/billing/actions";
import { requireSchoolPermission } from "@/lib/auth/session";

/** Paystack sends billing staff back here; the payment is re-verified before the plan changes. */
export default async function BillingCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  await requireSchoolPermission("billing.manage");
  const { reference, trxref } = await searchParams;
  redirect(`/school/billing?payment=${await confirmSubscriptionReturn(reference ?? trxref ?? "")}`);
}
