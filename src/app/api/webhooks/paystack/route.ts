import { NextResponse, type NextRequest } from "next/server";

import { confirmAnyReference } from "@/lib/payments/complete";
import { isPaystackConfigured, verifySignature } from "@/lib/payments/paystack";

/** Paystack webhook: signature-checked, then re-verified with Paystack's API before recording. */
export async function POST(request: NextRequest) {
  if (!isPaystackConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 100_000 || !verifySignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  if (event.event === "charge.success" && typeof event.data?.reference === "string") {
    await confirmAnyReference(event.data.reference);
  }
  return NextResponse.json({ received: true });
}
