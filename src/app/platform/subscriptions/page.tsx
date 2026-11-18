import { CircleDollarSign, CreditCard, HandHeart, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { saveSponsor } from "@/app/platform/subscriptions/actions";
import { HorizontalBars } from "@/components/dashboard/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import { FUNDING_LABEL, SPONSOR_KINDS, SUB_INVOICE_STATUS, SUB_METHOD_LABEL, SUBSCRIPTION_STATUS } from "@/lib/billing";
import { cedis } from "@/lib/finance";
import { pageRange } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Subscriptions" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "schools", label: "Schools" },
  { key: "invoices", label: "Invoices" },
  { key: "sponsors", label: "Sponsors" },
] as const;

type Revenue = {
  by_month: { month: string; collected: number; sponsor_covered: number }[];
  open_invoices: { count: number; amount: number };
  by_status: Record<string, number>;
  by_plan: { plan: string; schools: number }[];
  sponsors: { sponsor: string; active_schools: number; covered_total: number }[];
};
type SubRow = { school_id: string; status: string; funding_model: string; billing_cycle: string; current_period_end: string | null; subscription_plans: { name: string }; schools: { name: string; is_demo: boolean } };
type InvRow = { id: string; school_id: string; invoice_number: string; status: string; amount_due: number; sponsor_amount: number; payment_method: string | null; paid_at: string | null; created_at: string; subscription_plans: { name: string }; schools: { name: string } };
type Sponsor = { id: string; name: string; kind: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; notes: string | null; is_active: boolean };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; page?: string; edit?: string }> }) {
  await requirePlatformPermission("subscriptions.manage");
  const params = await searchParams;
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "overview";
  const supabase = await createClient();
  let body: React.ReactNode;

  if (tab === "overview") {
    const { data } = await supabase.rpc("platform_revenue");
    const r = data as Revenue | null;
    const thisMonth = r?.by_month.at(-1);
    const year = (r?.by_month ?? []).reduce((n, m) => n + Number(m.collected), 0);
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Collected this month" value={0} display={cedis(thisMonth?.collected ?? 0)} icon={CircleDollarSign} tone="success" />
          <StatCard label="Collected, last 12 months" value={0} display={cedis(year)} icon={Receipt} />
          <StatCard label="Open invoices" value={r?.open_invoices.count ?? 0} detail={cedis(r?.open_invoices.amount ?? 0)} icon={CreditCard} tone="warning" href="/platform/subscriptions?tab=invoices&status=open" />
          <StatCard label="Past due" value={r?.by_status.past_due ?? 0} detail={`${r?.by_status.grace ?? 0} in grace period`} icon={CreditCard} tone="warning" href="/platform/subscriptions?tab=schools&status=past_due" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Platform billing records only; sample schools are excluded. Sponsor-covered amounts are billed to sponsors separately.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Collected by month" description="School payments (GH₵), excluding sponsor-covered amounts" />
            <CardBody>
              {year > 0 ? <HorizontalBars label="GH₵ collected" height={360} data={(r?.by_month ?? []).map((m) => ({ name: m.month, value: Number(m.collected) }))} /> : <EmptyState icon={Receipt} title="No payments yet" />}
            </CardBody>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Schools by plan" description="Subscriptions in good standing" />
              <ul className="divide-y divide-border text-sm">
                {(r?.by_plan ?? []).map((p) => <li key={p.plan} className="flex justify-between px-5 py-2.5"><span>{p.plan}</span><span className="font-medium tabular-nums">{p.schools}</span></li>)}
                {!r?.by_plan.length && <li className="px-5 py-3 text-muted-foreground">No subscriptions yet.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Sponsors" />
              <ul className="divide-y divide-border text-sm">
                {(r?.sponsors ?? []).map((s) => <li key={s.sponsor} className="flex justify-between px-5 py-2.5"><span>{s.sponsor} <span className="text-xs text-muted-foreground">· {s.active_schools} schools</span></span><span className="tabular-nums">{cedis(s.covered_total)}</span></li>)}
                {!r?.sponsors.length && <li className="px-5 py-3 text-muted-foreground">No sponsors yet.</li>}
              </ul>
            </Card>
          </div>
        </div>
      </>
    );
  } else if (tab === "schools") {
    const { page, from, to } = pageRange(params.page, 50);
    let q = supabase.from("subscriptions").select("school_id, status, funding_model, billing_cycle, current_period_end, subscription_plans(name), schools!inner(name, is_demo)", { count: "exact" });
    if (params.status && params.status in SUBSCRIPTION_STATUS) q = q.eq("status", params.status);
    const { data, count } = await q.order("current_period_end", { ascending: true, nullsFirst: false }).range(from, to).returns<SubRow[]>();
    body = (
      <Card>
        <form className="flex gap-3 border-b border-border p-4" role="search">
          <input type="hidden" name="tab" value="schools" />
          <Select name="status" defaultValue={params.status ?? ""} aria-label="Status" className="sm:w-48"><option value="">All statuses</option>{Object.entries(SUBSCRIPTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <button type="submit" className="text-sm font-medium text-royal hover:underline">Filter</button>
        </form>
        {!data?.length ? <EmptyState icon={CreditCard} title="No subscriptions" /> : (
          <Table>
            <thead><tr><Th>School</Th><Th>Plan</Th><Th>Funding</Th><Th>Ends</Th><Th>Status</Th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.school_id}>
                  <Td><Link href={`/platform/schools/${s.school_id}`} className="font-medium hover:underline">{s.schools.name}</Link>{s.schools.is_demo && <Badge className="ml-2">Sample</Badge>}</Td>
                  <Td>{s.subscription_plans.name} <span className="text-xs text-muted-foreground">{s.billing_cycle !== "none" ? s.billing_cycle : ""}</span></Td>
                  <Td>{FUNDING_LABEL[s.funding_model]}</Td>
                  <Td>{s.current_period_end ? formatDate(s.current_period_end) : "—"}</Td>
                  <Td><Badge tone={SUBSCRIPTION_STATUS[s.status]?.tone}>{SUBSCRIPTION_STATUS[s.status]?.label}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager tab="schools" page={page} total={count ?? 0} size={50} status={params.status} />
      </Card>
    );
  } else if (tab === "invoices") {
    const { page, from, to } = pageRange(params.page, 50);
    let q = supabase.from("subscription_invoices").select("id, school_id, invoice_number, status, amount_due, sponsor_amount, payment_method, paid_at, created_at, subscription_plans(name), schools(name)", { count: "exact" });
    if (params.status && params.status in SUB_INVOICE_STATUS) q = q.eq("status", params.status);
    const { data, count } = await q.order("created_at", { ascending: false }).range(from, to).returns<InvRow[]>();
    body = (
      <Card>
        <form className="flex gap-3 border-b border-border p-4" role="search">
          <input type="hidden" name="tab" value="invoices" />
          <Select name="status" defaultValue={params.status ?? ""} aria-label="Status" className="sm:w-48"><option value="">All statuses</option>{Object.entries(SUB_INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          <button type="submit" className="text-sm font-medium text-royal hover:underline">Filter</button>
        </form>
        {!data?.length ? <EmptyState icon={Receipt} title="No invoices" /> : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>School</Th><Th>Plan</Th><Th className="text-right">Due</Th><Th>Status</Th></tr></thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id}>
                  <Td className="font-mono text-xs">{i.invoice_number}<span className="block font-sans text-muted-foreground">{formatDate(i.created_at)}</span></Td>
                  <Td><Link href={`/platform/schools/${i.school_id}`} className="hover:underline">{i.schools.name}</Link></Td>
                  <Td>{i.subscription_plans.name}</Td>
                  <Td className="text-right tabular-nums">{cedis(i.amount_due)}{Number(i.sponsor_amount) > 0 && <span className="block text-xs text-muted-foreground">+ {cedis(i.sponsor_amount)} sponsor</span>}</Td>
                  <Td><Badge tone={SUB_INVOICE_STATUS[i.status]?.tone}>{SUB_INVOICE_STATUS[i.status]?.label}</Badge>{i.paid_at && <span className="block text-xs text-muted-foreground">{SUB_METHOD_LABEL[i.payment_method ?? ""]}</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager tab="invoices" page={page} total={count ?? 0} size={50} status={params.status} />
      </Card>
    );
  } else {
    const { data } = await supabase.from("sponsors").select("id, name, kind, contact_name, contact_email, contact_phone, notes, is_active").order("name").returns<Sponsor[]>();
    const editing = data?.find((s) => s.id === params.edit);
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          {!data?.length ? <EmptyState icon={HandHeart} title="No sponsors yet">Add organisations that pay for or subsidise schools&apos; plans.</EmptyState> : (
            <ul className="divide-y divide-border">
              {data.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{s.name} {!s.is_active && <Badge className="ml-1">Inactive</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{SPONSOR_KINDS.find((k) => k.value === s.kind)?.label}{s.contact_name ? ` · ${s.contact_name}` : ""}{s.contact_email ? ` · ${s.contact_email}` : ""}</p>
                  </div>
                  <Link href={`/platform/subscriptions?tab=sponsors&edit=${s.id}`} className="text-sm text-royal hover:underline">Edit</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader title={editing ? `Edit ${editing.name}` : "Add a sponsor"} description="Sponsorships are set on each school's page." />
          <CardBody>
            <ActionForm action={saveSponsor} key={editing?.id ?? "new"} resetOnSuccess={!editing}>
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <Field label="Name" htmlFor="sp-name"><Input id="sp-name" name="name" defaultValue={editing?.name} required /></Field>
              <Field label="Type" htmlFor="sp-kind"><Select id="sp-kind" name="kind" defaultValue={editing?.kind ?? "ngo"}>{SPONSOR_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
              <Field label="Contact person" htmlFor="sp-cn"><Input id="sp-cn" name="contact_name" defaultValue={editing?.contact_name ?? ""} /></Field>
              <Field label="Contact email" htmlFor="sp-ce"><Input id="sp-ce" name="contact_email" type="email" defaultValue={editing?.contact_email ?? ""} /></Field>
              <Field label="Contact phone" htmlFor="sp-cp"><Input id="sp-cp" name="contact_phone" defaultValue={editing?.contact_phone ?? ""} /></Field>
              <Field label="Notes" htmlFor="sp-notes"><Textarea id="sp-notes" name="notes" rows={3} defaultValue={editing?.notes ?? ""} /></Field>
              {editing && (
                <Field label="Status" htmlFor="sp-active"><Select id="sp-active" name="is_active" defaultValue={editing.is_active ? "on" : "off"}><option value="on">Active</option><option value="off">Inactive</option></Select></Field>
              )}
              <SubmitButton size="sm">{editing ? "Save" : "Add sponsor"}</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Subscriptions" description="School plans, invoices, payments and sponsorships. Prices and limits are set under Plans." />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Subscription sections">
        {TABS.map((t) => (
          <Link key={t.key} href={`/platform/subscriptions?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === t.key ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}

function Pager({ tab, page, total, size, status }: { tab: string; page: number; total: number; size: number; status?: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const href = (p: number) => `/platform/subscriptions?tab=${tab}&page=${p}${status ? `&status=${status}` : ""}`;
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
      <span className="text-muted-foreground">Page {page} of {pages}</span>
      <span className="flex gap-3">
        {page > 1 && <Link href={href(page - 1)} className="text-royal hover:underline">Previous</Link>}
        {page < pages && <Link href={href(page + 1)} className="text-royal hover:underline">Next</Link>}
      </span>
    </div>
  );
}
