import { ArrowLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceOps, RecordPaymentForm, ReversePaymentForm } from "@/components/finance/forms";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { cedis, INVOICE_STATUS, METHOD_LABEL } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { school } = await requireSchoolPermission("finance.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: inv } = await supabase.from("student_invoices").select("id, invoice_number, status, total, amount_paid, due_date, issued_at, notes, students(id, first_name, last_name, student_number), academic_terms(name)").eq("id", id).eq("school_id", school.schoolId)
    .maybeSingle<{ id: string; invoice_number: string; status: string; total: number; amount_paid: number; due_date: string | null; issued_at: string; notes: string | null; students: { id: string; first_name: string; last_name: string; student_number: string }; academic_terms: { name: string } | null }>();
  if (!inv) notFound();
  const [{ data: lines }, { data: payments }] = await Promise.all([
    supabase.from("invoice_lines").select("id, description, amount").eq("invoice_id", id),
    supabase.from("student_payments").select("id, amount, method, reference, receipt_number, received_at, status, reversal_reason").eq("invoice_id", id).order("received_at"),
  ]);
  const balance = Number(inv.total) - Number(inv.amount_paid);
  const manage = school.permissions.has("finance.manage") && school.schoolStatus === "active" && inv.status !== "cancelled";

  return (
    <>
      <Link href="/school/finance?tab=invoices" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Invoices</Link>
      <PageHeader
        title={`Invoice ${inv.invoice_number}`}
        description={`${inv.students.first_name} ${inv.students.last_name} (${inv.students.student_number}) · ${inv.academic_terms?.name ?? "No term"} · issued ${formatDate(inv.issued_at)}${inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}`}
        actions={<Badge tone={INVOICE_STATUS[inv.status].tone}>{INVOICE_STATUS[inv.status].label}</Badge>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {(lines ?? []).map((l) => <tr key={l.id}><Td>{l.description}</Td><Td className={cn("text-right tabular-nums", Number(l.amount) < 0 && "text-accent")}>{cedis(l.amount)}</Td></tr>)}
                <tr><Td className="font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{cedis(inv.total)}</Td></tr>
                <tr><Td>Paid</Td><Td className="text-right tabular-nums">{cedis(inv.amount_paid)}</Td></tr>
                <tr><Td className="font-semibold">Balance</Td><Td className="text-right font-semibold tabular-nums">{cedis(Math.max(0, balance))}</Td></tr>
              </tbody>
            </Table>
            {inv.notes && <CardBody className="border-t border-border text-sm text-muted-foreground">{inv.notes}</CardBody>}
          </Card>
          <Card>
            <CardHeader title="Payments" />
            {!payments?.length ? <CardBody className="text-sm text-muted-foreground">No payments recorded.</CardBody> : (
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li key={p.id} className="space-y-2 px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className={cn("font-medium tabular-nums", p.status === "reversed" && "line-through")}>{cedis(p.amount)}</span> · {METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""}<span className="block text-xs text-muted-foreground">{p.receipt_number} · {formatDate(p.received_at, { dateStyle: "medium", timeStyle: "short" })}{p.status === "reversed" ? ` · reversed: ${p.reversal_reason}` : ""}</span></span>
                      <Link href={`/school/finance/receipts/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-royal hover:underline"><Printer className="h-3.5 w-3.5" /> Receipt</Link>
                    </div>
                    {manage && p.status === "confirmed" && <ReversePaymentForm invoiceId={inv.id} paymentId={p.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {manage && (
          <div className="space-y-6">
            {balance > 0 && <Card><CardHeader title="Record a payment" /><CardBody><RecordPaymentForm invoiceId={inv.id} balance={balance} /></CardBody></Card>}
            <Card><CardHeader title="Adjust" /><CardBody><InvoiceOps invoiceId={inv.id} canCancel={!(payments ?? []).some((p) => p.status === "confirmed")} /></CardBody></Card>
          </div>
        )}
      </div>
    </>
  );
}
