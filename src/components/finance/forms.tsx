"use client";

import { useActionState } from "react";

import { generateInvoices, invoiceAction, recordPayment } from "@/app/school/finance/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

type Opt = { value: string; label: string };
const Msg = ({ s }: { s: FormState }) => (s.message ? <Alert tone={s.ok ? "success" : "danger"}>{s.message}</Alert> : null);

export function GenerateInvoicesForm({ terms, classes, defaultTerm }: { terms: Opt[]; classes: Opt[]; defaultTerm?: string }) {
  const [state, action] = useActionState(generateInvoices, {} as FormState);
  return (
    <form action={action} className="space-y-3">
      <Msg s={state} />
      <Field label="Term" htmlFor="gi-term"><Select id="gi-term" name="termId" defaultValue={defaultTerm}>{terms.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
      <Field label="Class" htmlFor="gi-class"><Select id="gi-class" name="classId" defaultValue=""><option value="">Whole school</option>{classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
      <Field label="Due date (optional)" htmlFor="gi-due"><Input id="gi-due" name="dueDate" type="date" /></Field>
      <p className="text-xs text-muted-foreground">Each active student gets one invoice built from the fee items that apply to them. Students already invoiced for the term are skipped.</p>
      <SubmitButton>Issue invoices</SubmitButton>
    </form>
  );
}

export function RecordPaymentForm({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  const [state, action] = useActionState(recordPayment, {} as FormState);
  return (
    <form key={state.ok ? Date.now() : "p"} action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Msg s={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (GH₵)" htmlFor="rp-amount"><Input id="rp-amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={balance > 0 ? balance.toFixed(2) : ""} /></Field>
        <Field label="Method" htmlFor="rp-method">
          <Select id="rp-method" name="method" defaultValue="mobile_money">
            <option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="bank">Bank deposit</option><option value="cheque">Cheque</option><option value="card">Card (in person)</option>
          </Select>
        </Field>
      </div>
      <Field label="Reference (optional)" htmlFor="rp-ref" hint="MoMo transaction ID, bank slip number…"><Input id="rp-ref" name="reference" maxLength={120} /></Field>
      <SubmitButton>Record payment</SubmitButton>
    </form>
  );
}

export function InvoiceOps({ invoiceId, canCancel }: { invoiceId: string; canCancel: boolean }) {
  const [state, action] = useActionState(invoiceAction, {} as FormState);
  return (
    <div className="space-y-4">
      <Msg s={state} />
      <form action={action} className="space-y-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="op" value="add_line" />
        <p className="text-sm font-medium">Add a charge or discount</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input name="description" placeholder="e.g. Scholarship, Extra classes" aria-label="Description" />
          <Input name="amount" type="number" step="0.01" placeholder="GH₵ (negative = discount)" aria-label="Amount" className="sm:w-48" />
          <SubmitButton size="sm" variant="secondary">Add</SubmitButton>
        </div>
      </form>
      {canCancel && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="op" value="cancel" />
          <p className="text-sm font-medium">Cancel invoice</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input name="reason" placeholder="Reason (required)" aria-label="Reason" />
            <SubmitButton size="sm" variant="danger">Cancel invoice</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

export function ReversePaymentForm({ invoiceId, paymentId }: { invoiceId: string; paymentId: string }) {
  const [state, action] = useActionState(invoiceAction, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="op" value="reverse" />
      <Input name="reason" placeholder="Reason for reversal" aria-label="Reason for reversal" className="h-8 sm:w-56" />
      <SubmitButton size="sm" variant="secondary">Reverse</SubmitButton>
      {state.message && <span className={state.ok ? "text-xs text-accent" : "text-xs text-danger"}>{state.message}</span>}
    </form>
  );
}
