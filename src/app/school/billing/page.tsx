import { Check, CreditCard, HandHeart, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { cancelInvoice, choosePlan, paySubscription } from "@/app/school/billing/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { FUNDING_LABEL, limitText, SUB_INVOICE_STATUS, SUB_METHOD_LABEL, SUBSCRIPTION_STATUS, type PlanLimits } from "@/lib/billing";
import { cedis } from "@/lib/finance";
import { isPaystackConfigured } from "@/lib/payments/paystack";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing & plan" };

type Summary = {
  subscription: { plan_code: string; plan_name: string; status: string; billing_cycle: string; current_period_end: string | null; funding_model: string } | null;
  limits: PlanLimits;
  usage: { active_students: number; active_staff: number; ai_requests_this_month: number };
  sponsorship: { sponsor: string; coverage_percent: number; plan_name: string; starts_on: string; ends_on: string | null } | null;
};
type Plan = { code: string; name: string; description: string | null; price_monthly_ghs: number | null; price_annual_ghs: number | null; features: string[]; limits: PlanLimits };
type Invoice = {
  id: string; invoice_number: string; billing_cycle: string; kind: string; period_start: string; period_end: string; list_amount: number; sponsor_amount: number;
  amount_due: number; status: string; payment_method: string | null; paid_at: string | null; created_at: string; subscription_plans: { name: string } | null;
};

const PAYMENT_NOTICE: Record<string, { tone: "success" | "info" | "danger"; text: string }> = {
  succeeded: { tone: "success", text: "Payment confirmed — your plan is active." },
  pending: { tone: "info", text: "Paystack is still processing the payment. This page will update once it's confirmed." },
  failed: { tone: "danger", text: "The payment wasn't completed. Nothing was charged to your plan — you can try again." },
};

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{used.toLocaleString("en-GH")} / {limitText(limit)}</span></div>
      {limit != null && limit > 0 && (
        <div className="mt-1.5 h-2 rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className={cn("h-2 rounded-full", pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warning" : "bg-royal")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { school } = await requireSchoolPermission("billing.manage");
  const { payment } = await searchParams;
  const supabase = await createClient();
  const [{ data: summaryData }, { data: plans }, { data: invoices }] = await Promise.all([
    supabase.rpc("school_billing_summary", { p_school: school.schoolId }),
    supabase.from("subscription_plans").select("code, name, description, price_monthly_ghs, price_annual_ghs, features, limits").eq("is_active", true).order("sort").returns<Plan[]>(),
    supabase.from("subscription_invoices").select("id, invoice_number, billing_cycle, kind, period_start, period_end, list_amount, sponsor_amount, amount_due, status, payment_method, paid_at, created_at, subscription_plans(name)")
      .eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(24).returns<Invoice[]>(),
  ]);
  const s = summaryData as Summary | null;
  const sub = s?.subscription;
  const open = invoices?.find((i) => i.status === "open");
  const canWrite = school.schoolStatus === "active";
  const purchasable = (plans ?? []).filter((p) => p.code !== "free" && (p.price_monthly_ghs != null || p.price_annual_ghs != null));
  const notice = payment ? PAYMENT_NOTICE[payment] : undefined;

  return (
    <>
      <PageHeader title="Billing & plan" description="Your school's AI SHS Ghana subscription. Prices are in Ghana cedis." />
      {notice && <Alert tone={notice.tone} className="mb-6">{notice.text}</Alert>}
      {sub?.status === "grace" && <Alert tone="warning" className="mb-6" title="Your plan has ended">Pay the renewal invoice within 14 days of the end date to keep your plan&apos;s features.</Alert>}
      {sub?.status === "past_due" && <Alert tone="danger" className="mb-6" title="Subscription past due">Your school has the Free plan&apos;s limits until the renewal is paid. No records have been deleted.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={sub ? `${sub.plan_name} plan` : "No plan"}
            description={sub?.current_period_end ? `${sub.status === "active" ? "Renews or ends" : "Ended"} ${formatDate(sub.current_period_end)} · ${sub.billing_cycle === "annual" ? "Annual" : sub.billing_cycle === "monthly" ? "Monthly" : "No billing period"}` : "No end date"}
            action={sub && <Badge tone={SUBSCRIPTION_STATUS[sub.status]?.tone ?? "neutral"}>{SUBSCRIPTION_STATUS[sub.status]?.label ?? sub.status}</Badge>}
          />
          <CardBody className="space-y-4">
            <Usage label="Active students" used={s?.usage.active_students ?? 0} limit={s?.limits.max_students} />
            <Usage label="Active staff records" used={s?.usage.active_staff ?? 0} limit={s?.limits.max_staff} />
            <Usage label="AI requests this month" used={s?.usage.ai_requests_this_month ?? 0} limit={s?.limits.ai_requests_per_month} />
            {sub && <p className="text-xs text-muted-foreground">Funding: {FUNDING_LABEL[sub.funding_model] ?? sub.funding_model}. The platform team may set a different AI allowance for your school.</p>}
          </CardBody>
        </Card>

        <div className="space-y-6">
          {s?.sponsorship && (
            <Card>
              <CardHeader title="Sponsorship" />
              <CardBody className="flex gap-3 text-sm">
                <HandHeart className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                <p><strong>{s.sponsorship.sponsor}</strong> covers {Number(s.sponsorship.coverage_percent)}% of the {s.sponsorship.plan_name} plan{s.sponsorship.ends_on ? ` until ${formatDate(s.sponsorship.ends_on)}` : ""}.</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Amount due" />
            <CardBody>
              {!open ? (
                <p className="text-sm text-muted-foreground">Nothing to pay right now.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-2xl font-semibold tabular-nums">{cedis(open.amount_due)}</p>
                  <p className="text-muted-foreground">
                    {open.invoice_number} · {open.subscription_plans?.name} ({open.billing_cycle}) · {formatDate(open.period_start)} – {formatDate(open.period_end)}
                    {Number(open.sponsor_amount) > 0 && <> · sponsor covers {cedis(open.sponsor_amount)}</>}
                  </p>
                  {canWrite && (
                    <>
                      <ActionForm action={paySubscription}>
                        <input type="hidden" name="invoiceId" value={open.id} />
                        <SubmitButton size="sm"><CreditCard className="h-4 w-4" /> Pay with Mobile Money or card</SubmitButton>
                      </ActionForm>
                      {!isPaystackConfigured() && <p className="text-xs text-muted-foreground">Online payment isn&apos;t switched on yet. To pay by bank transfer, <Link href="/app/support/new?category=billing" className="text-royal hover:underline">contact support</Link> with the invoice number.</p>}
                      <form action={cancelInvoice}>
                        <input type="hidden" name="invoiceId" value={open.id} />
                        <ConfirmSubmit title="Cancel this invoice?" description="Your current plan is unchanged. You can request a new invoice at any time." confirmLabel="Cancel invoice">Cancel invoice</ConfirmSubmit>
                      </form>
                    </>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Change or renew your plan" description="Choosing a plan creates an invoice. A new plan starts on the day it's paid; renewing the same plan continues from your current end date." />
        <CardBody>
          {!purchasable.length ? (
            <p className="text-sm text-muted-foreground">Paid plans are arranged directly with our team for now. <Link href="/app/support/new?category=billing" className="text-royal hover:underline">Contact support</Link>.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {purchasable.map((p) => (
                <div key={p.code} className={cn("flex flex-col rounded-lg border p-5", sub?.plan_code === p.code ? "border-royal ring-1 ring-royal/30" : "border-border")}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    {sub?.plan_code === p.code && <Badge tone="info">Current</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <p className="mt-3 text-sm">
                    {p.price_monthly_ghs != null && <span className="block"><strong>{cedis(p.price_monthly_ghs)}</strong> / month</span>}
                    {p.price_annual_ghs != null && <span className="block"><strong>{cedis(p.price_annual_ghs)}</strong> / year</span>}
                  </p>
                  <ul className="mt-3 flex-1 space-y-1 text-sm">
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{limitText(p.limits.max_students)} students</li>
                    {p.features.slice(0, 4).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{f}</li>)}
                  </ul>
                  {canWrite && (
                    <ActionForm action={choosePlan} className="mt-4 flex gap-2">
                      <input type="hidden" name="plan" value={p.code} />
                      <Select name="cycle" aria-label={`Billing period for ${p.name}`} className="h-9" defaultValue={p.price_monthly_ghs != null ? "monthly" : "annual"}>
                        {p.price_monthly_ghs != null && <option value="monthly">Monthly</option>}
                        {p.price_annual_ghs != null && <option value="annual">Annual</option>}
                      </Select>
                      <SubmitButton size="sm" variant="secondary">{sub?.plan_code === p.code ? "Renew" : "Choose"}</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Public schools can be sponsored or subsidised by partners such as alumni associations or NGOs. <Link href="/app/support/new?category=billing" className="text-royal hover:underline">Ask us about sponsorship</Link>.</p>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Invoices" />
        {!invoices?.length ? <EmptyState icon={Receipt} title="No invoices yet" /> : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Plan</Th><Th>Period</Th><Th className="text-right">Amount</Th><Th>Status</Th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <Td className="font-mono text-xs">{i.invoice_number}</Td>
                  <Td>{i.subscription_plans?.name} <span className="text-xs text-muted-foreground">({i.billing_cycle}{i.kind === "renewal" ? ", renewal" : ""})</span></Td>
                  <Td className="text-xs">{formatDate(i.period_start)} – {formatDate(i.period_end)}</Td>
                  <Td className="text-right tabular-nums">{cedis(i.amount_due)}{Number(i.sponsor_amount) > 0 && <span className="block text-xs text-muted-foreground">of {cedis(i.list_amount)}</span>}</Td>
                  <Td>
                    <Badge tone={SUB_INVOICE_STATUS[i.status]?.tone}>{SUB_INVOICE_STATUS[i.status]?.label}</Badge>
                    {i.paid_at && <span className="block text-xs text-muted-foreground">{SUB_METHOD_LABEL[i.payment_method ?? ""] ?? i.payment_method} · {formatDate(i.paid_at)}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
