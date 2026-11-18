import type { Metadata } from "next";

import { Receipt } from "@/components/finance/receipt";
import { requireSchoolPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSchoolPermission("finance.read");
  return <Receipt paymentId={(await params).id} />;
}
