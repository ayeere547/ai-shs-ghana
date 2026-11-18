export const cedis = (v: number | string | null | undefined) => `GH₵ ${Number(v ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const INVOICE_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Unpaid", tone: "danger" },
  partially_paid: { label: "Part paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const METHOD_LABEL: Record<string, string> = { cash: "Cash", mobile_money: "Mobile money", bank: "Bank", cheque: "Cheque", card: "Card", online: "Online (Paystack)" };
