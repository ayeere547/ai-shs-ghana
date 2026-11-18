import { redirect } from "next/navigation";

import { confirmReturn } from "@/app/parent/actions";
import { requireParent } from "@/lib/parent";

/** Return URL from Paystack checkout: re-verifies the payment server-side, then shows the child's page. */
export default async function PaymentCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  await requireParent();
  const { reference, trxref } = await searchParams;
  const res = await confirmReturn(reference ?? trxref ?? "");
  if (res === "failed") redirect("/parent?payment=failed");
  redirect(`/parent/child/${res.studentId}?payment=${res.status}`);
}
