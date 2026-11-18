import { assignPlan, endSponsorship, issueInvoice, recordPayment, setSponsorship, voidInvoice } from "@/app/platform/subscriptions/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, Input, Select } from "@/components/ui/primitives";
import { FUNDING_LABEL, SUBSCRIPTION_STATUS } from "@/lib/billing";
import { cedis } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

type Summary = {
  subscription: { plan_code: string; plan_name: string; status: string; billing_cycle: string; current_period_end: string | null; funding_model: string } | null;
  sponsorship: { sponsor: string; coverage_percent: number; plan_name: string; ends_on: string | null } | null;
  usage: { active_students: number };
};

const label = "mb-1 block text-xs font-medium text-muted-foreground";

/** Platform finance view of one school's subscription: plan, open invoice, sponsorship and direct changes. */
export async function SubscriptionPanel({ schoolId }: { schoolId: string }) {
  const supabase = await createClient();
  const [{ data }, { data: plans }, { data: sponsors }, { data: open }, { data: sp }] = await Promise.all([
    supabase.rpc("school_billing_summary", { p_school: schoolId }),
    supabase.from("subscription_plans").select("code, name, price_monthly_ghs, price_annual_ghs").eq("is_active", true).order("sort"),
    supabase.from("sponsors").select("id, name").eq("is_active", true).order("name"),
    supabase.from("subscription_invoices").select("id, invoice_number, amount_due, sponsor_amount, period_start, period_end").eq("school_id", schoolId).eq("status", "open").maybeSingle(),
    supabase.from("sponsorships").select("id").eq("school_id", schoolId).eq("status", "active").maybeSingle(),
  ]);
  const s = data as Summary | null;
  const sub = s?.subscription;
  const paid = (plans ?? []).filter((p) => p.code !== "free");

  return (
    <Card>
      <CardHeader
        title="Subscription"
        description={sub ? `${sub.plan_name} · ${FUNDING_LABEL[sub.funding_model] ?? sub.funding_model}${sub.current_period_end ? ` · until ${formatDate(sub.current_period_end)}` : ""}` : "No subscription yet"}
        action={sub && <Badge tone={SUBSCRIPTION_STATUS[sub.status]?.tone}>{SUBSCRIPTION_STATUS[sub.status]?.label}</Badge>}
      />
      <CardBody className="space-y-5 text-sm">
        <p className="text-muted-foreground">{s?.usage.active_students ?? 0} active students.</p>
        {s?.sponsorship && (
          <div className="flex items-start justify-between gap-2 rounded-md bg-surface-muted p-3">
            <p><strong>{s.sponsorship.sponsor}</strong> covers {Number(s.sponsorship.coverage_percent)}% of {s.sponsorship.plan_name}{s.sponsorship.ends_on ? ` until ${formatDate(s.sponsorship.ends_on)}` : ""}.</p>
            {sp && (
              <form action={endSponsorship}>
                <input type="hidden" name="id" value={sp.id} /><input type="hidden" name="schoolId" value={schoolId} />
                <ConfirmSubmit title="End this sponsorship?" description="Future invoices will be charged in full." confirmLabel="End">End</ConfirmSubmit>
              </form>
            )}
          </div>
        )}

        {open ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p><strong>{open.invoice_number}</strong> · {cedis(open.amount_due)} due · {formatDate(open.period_start)} – {formatDate(open.period_end)}</p>
            <ActionForm action={recordPayment} className="grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
              <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="invoiceId" value={open.id} />
              <Select name="method" aria-label="Payment method" className="h-9">
                <option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cheque">Cheque</option><option value="waived">Waive</option>
              </Select>
              <Input name="reference" placeholder="Reference or reason" aria-label="Reference" className="h-9" />
              <SubmitButton size="sm" variant="secondary">Record</SubmitButton>
            </ActionForm>
            <form action={voidInvoice}>
              <input type="hidden" name="invoiceId" value={open.id} /><input type="hidden" name="schoolId" value={schoolId} />
              <ConfirmSubmit title="Cancel this invoice?" description="The school's current plan is unchanged." confirmLabel="Cancel invoice">Cancel invoice</ConfirmSubmit>
            </form>
          </div>
        ) : paid.some((p) => p.price_monthly_ghs != null || p.price_annual_ghs != null) && (
          <details>
            <summary className="cursor-pointer font-medium text-royal">Issue an invoice</summary>
            <ActionForm action={issueInvoice} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="schoolId" value={schoolId} />
              <Select name="plan" aria-label="Plan" className="h-9 w-auto">{paid.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select>
              <Select name="cycle" aria-label="Billing period" className="h-9 w-auto"><option value="monthly">Monthly</option><option value="annual">Annual</option></Select>
              <SubmitButton size="sm" variant="secondary">Issue</SubmitButton>
            </ActionForm>
          </details>
        )}

        <details>
          <summary className="cursor-pointer font-medium text-royal">{s?.sponsorship ? "Replace sponsorship" : "Add a sponsorship"}</summary>
          {!sponsors?.length ? <p className="mt-2 text-muted-foreground">Add a sponsor under Subscriptions → Sponsors first.</p> : (
            <ActionForm action={setSponsorship} className="mt-2 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="schoolId" value={schoolId} />
              <div><span className={label}>Sponsor</span><Select name="sponsorId" className="h-9">{sponsors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>
              <div><span className={label}>Plan</span><Select name="plan" className="h-9">{paid.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></div>
              <div><span className={label}>Coverage %</span><Input name="percent" type="number" min="1" max="100" step="0.01" defaultValue="100" className="h-9" /></div>
              <div><span className={label}>Ends (optional)</span><Input name="endsOn" type="date" className="h-9" /></div>
              <div className="sm:col-span-2"><Input name="notes" placeholder="Notes (agreement reference)" aria-label="Notes" className="h-9" /></div>
              <div><SubmitButton size="sm" variant="secondary">Save sponsorship</SubmitButton></div>
            </ActionForm>
          )}
        </details>

        <details>
          <summary className="cursor-pointer font-medium text-royal">Assign a plan directly</summary>
          <ActionForm action={assignPlan} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="schoolId" value={schoolId} />
            <div><span className={label}>Plan</span><Select name="plan" className="h-9" defaultValue={sub?.plan_code}>{(plans ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></div>
            <div><span className={label}>Billing period</span><Select name="cycle" className="h-9"><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="none">None</option></Select></div>
            <div><span className={label}>Ends on (not needed for Free)</span><Input name="periodEnd" type="date" className="h-9" /></div>
            <div><span className={label}>Funding</span><Select name="funding" className="h-9">{Object.entries(FUNDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
            <div className="sm:col-span-2"><Input name="reason" placeholder="Reason (kept in the audit log)" aria-label="Reason" className="h-9" /></div>
            <div><SubmitButton size="sm" variant="secondary">Assign plan</SubmitButton></div>
          </ActionForm>
        </details>
      </CardBody>
    </Card>
  );
}
