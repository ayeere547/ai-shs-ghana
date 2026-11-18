"use client";

import { useActionState } from "react";

import { startOnlinePayment } from "@/app/parent/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

export function PayOnlineForm({ studentId, invoiceId, balance }: { studentId: string; invoiceId: string; balance: number }) {
  const [state, action] = useActionState(startOnlinePayment, {} as FormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">GH₵</span>
        <Input name="amount" type="number" step="0.01" min="1" max={balance} defaultValue={balance.toFixed(2)} aria-label="Amount to pay" className="h-9 w-32" />
        <SubmitButton size="sm">Pay with Mobile Money or card</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">You&apos;ll be taken to Paystack&apos;s secure page. The school is credited once Paystack confirms the payment.</p>
    </form>
  );
}
