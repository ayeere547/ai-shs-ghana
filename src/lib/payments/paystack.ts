import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack (GHS). Payments are only ever confirmed from the server: the webhook signature is
 * checked, then the transaction is re-verified with Paystack's API before anything is recorded.
 */
type FetchLike = typeof fetch;
const API = "https://api.paystack.co";

export const paystackKey = () => process.env.PAYSTACK_SECRET_KEY ?? "";
export const isPaystackConfigured = () => /^sk_(test|live)_/.test(paystackKey());

/** GH₵ → pesewas (Paystack's minor unit). */
export const toPesewas = (ghs: number) => Math.round(ghs * 100);
export const fromPesewas = (p: number) => Math.round(p) / 100;

/** Constant-time check of the x-paystack-signature header (HMAC-SHA512 of the raw body). */
export function verifySignature(rawBody: string, signature: string | null, secret = paystackKey()) {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function initializeTransaction(
  opts: { email: string; amountGhs: number; reference: string; subaccount?: string; callbackUrl: string; metadata: Record<string, unknown> },
  fetchImpl: FetchLike = fetch,
): Promise<{ authorizationUrl: string }> {
  const res = await fetchImpl(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: opts.email, amount: toPesewas(opts.amountGhs), currency: "GHS", reference: opts.reference,
      // School fees settle to the school's subaccount; platform subscriptions settle to the platform account.
      ...(opts.subaccount ? { subaccount: opts.subaccount, bearer: "subaccount" } : {}),
      callback_url: opts.callbackUrl, metadata: opts.metadata, channels: ["mobile_money", "card", "bank"],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; data?: { authorization_url?: string }; message?: string };
  if (!res.ok || !body.status || !body.data?.authorization_url) throw new Error(body.message ?? "Couldn't start the payment.");
  return { authorizationUrl: body.data.authorization_url };
}

export type Verified = { ok: boolean; status: string; amountGhs: number; currency: string; id: string; reference: string };

export async function verifyTransaction(reference: string, fetchImpl: FetchLike = fetch): Promise<Verified> {
  const res = await fetchImpl(`${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paystackKey()}` } });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; data?: { status: string; amount: number; currency: string; id: number; reference: string } };
  const d = body.data;
  if (!res.ok || !body.status || !d) return { ok: false, status: "unknown", amountGhs: 0, currency: "", id: "", reference };
  return { ok: d.status === "success" && d.currency === "GHS" && d.reference === reference, status: d.status, amountGhs: fromPesewas(d.amount), currency: d.currency, id: String(d.id), reference: d.reference };
}

/** Paystack checkout pages are always on paystack.com / paystack.co. */
export const isPaystackCheckoutUrl = (url: string) => /^https:\/\/([a-z0-9-]+\.)*paystack\.(com|co)\//i.test(url);
