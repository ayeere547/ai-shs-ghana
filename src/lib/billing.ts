export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  trialing: { label: "Trial", tone: "info" },
  active: { label: "Active", tone: "success" },
  grace: { label: "Grace period", tone: "warning" },
  past_due: { label: "Past due", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const FUNDING_LABEL: Record<string, string> = {
  self_funded: "Paid by the school",
  sponsored: "Sponsored",
  subsidised: "Subsidised",
  institution_funded: "Institution-funded",
};

export const SUB_INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  open: { label: "Due", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Cancelled", tone: "neutral" },
};

export const SUB_METHOD_LABEL: Record<string, string> = {
  paystack: "Paystack (online)",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
  sponsor: "Covered by sponsor",
  waived: "Waived",
};

export const SPONSOR_KINDS = [
  { value: "government", label: "Government / public agency" },
  { value: "ngo", label: "NGO / foundation" },
  { value: "alumni", label: "Alumni / old students" },
  { value: "corporate", label: "Company" },
  { value: "religious", label: "Religious body" },
  { value: "individual", label: "Individual" },
  { value: "other", label: "Other" },
];

export type PlanLimits = { max_students?: number | null; max_staff?: number | null; ai_requests_per_month?: number | null };

export const limitText = (n: number | null | undefined) => (n == null ? "Unlimited" : n.toLocaleString("en-GH"));

/** Postgres error text from our RPCs is written for people; anything else gets a generic message. */
export function friendlyError(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  return /permission denied|violates|syntax|column|relation|function/i.test(message) ? fallback : message.charAt(0).toUpperCase() + message.slice(1);
}
