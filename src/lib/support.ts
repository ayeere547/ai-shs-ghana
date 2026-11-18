export const TICKET_CATEGORIES = [
  { value: "technical", label: "Something isn't working" },
  { value: "billing", label: "Billing, plans or sponsorship" },
  { value: "account", label: "Account, sign-in or school registration" },
  { value: "data_protection", label: "Data protection request (access, correction, deletion)" },
  { value: "feature_request", label: "Suggest an improvement" },
  { value: "other", label: "Something else" },
] as const;

export const TICKET_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  open: { label: "Open", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  waiting_on_requester: { label: "Awaiting your reply", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const TICKET_PRIORITY: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  low: { label: "Low", tone: "neutral" },
  normal: { label: "Normal", tone: "neutral" },
  high: { label: "High", tone: "warning" },
  urgent: { label: "Urgent", tone: "danger" },
};

export const categoryLabel = (v: string) => TICKET_CATEGORIES.find((c) => c.value === v)?.label ?? v;
