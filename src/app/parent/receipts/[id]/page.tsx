import type { Metadata } from "next";

import { Receipt } from "@/components/finance/receipt";
import { requireParent } from "@/lib/parent";

export const metadata: Metadata = { title: "Receipt" };

export default async function ParentReceipt({ params }: { params: Promise<{ id: string }> }) {
  await requireParent();
  return <Receipt paymentId={(await params).id} />;
}
