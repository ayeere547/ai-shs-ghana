import { Banknote, CircleDollarSign, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/dashboard/stat-card";
import { GenerateInvoicesForm } from "@/components/finance/forms";
import { ResourceManager } from "@/components/school/resource-manager";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { cedis, INVOICE_STATUS, METHOD_LABEL } from "@/lib/finance";
import { labelFrom, pick, schoolLookups } from "@/lib/school/lookups";
import { pageRange, searchTerm } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "invoices", label: "Invoices" },
  { key: "fees", label: "Fee items" },
  { key: "expenditure", label: "Expenditure" },
  { key: "budgets", label: "Budgets" },
] as const;

type Inv = { id: string; invoice_number: string; status: string; total: number; amount_paid: number; due_date: string | null; students: { first_name: string; last_name: string; student_number: string; class_id: string | null } };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string; term?: string; status?: string; q?: string; page?: string; edit?: string }> }) {
  const { school } = await requireSchoolPermission("finance.read");
  const params = await searchParams;
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "overview";
  const l = await schoolLookups(school.schoolId);
  const termId = pick(l.terms, params.term, l.terms.find((t) => t.isCurrent)?.value);
  const manage = school.permissions.has("finance.manage") && school.schoolStatus === "active";
  const supabase = await createClient();
  const href = (t: string) => `/school/finance?tab=${t}${termId ? `&term=${termId}` : ""}`;

  let body: React.ReactNode;
  if (tab === "fees" || tab === "expenditure" || tab === "budgets") {
    body = <ResourceManager resource={tab} schoolId={school.schoolId} canManage={manage} editId={params.edit} hrefFor={(id) => `${href(tab)}${id ? `&edit=${id}` : ""}`} />;
  } else if (tab === "invoices") {
    const { page, from, to, size } = pageRange(params.page, 30);
    let q = supabase.from("student_invoices").select("id, invoice_number, status, total, amount_paid, due_date, students!inner(first_name, last_name, student_number, class_id)", { count: "exact" }).eq("school_id", school.schoolId);
    if (termId) q = q.eq("term_id", termId);
    if (params.status && params.status in INVOICE_STATUS) q = q.eq("status", params.status);
    const term = searchTerm(params.q);
    if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,student_number.ilike.%${term}%`, { referencedTable: "students" });
    const { data, count } = await q.order("invoice_number", { ascending: false }).range(from, to).returns<Inv[]>();
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card>
          <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search">
            <input type="hidden" name="tab" value="invoices" />
            <input type="hidden" name="term" value={termId ?? ""} />
            <Input name="q" defaultValue={params.q} placeholder="Student name or number…" aria-label="Search" className="sm:max-w-xs" />
            <Select name="status" defaultValue={params.status ?? ""} aria-label="Status" className="sm:w-40"><option value="">All statuses</option>{Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            <button type="submit" className={buttonClass("secondary")}>Filter</button>
          </form>
          {!data?.length ? <EmptyState icon={Receipt} title="No invoices">Set fee items, then issue invoices for the term.</EmptyState> : (
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Student</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th><Th>Status</Th></tr></thead>
              <tbody>
                {data.map((i) => (
                  <tr key={i.id} className="hover:bg-surface-muted/60">
                    <Td><Link href={`/school/finance/invoices/${i.id}`} className="font-mono text-xs font-medium hover:text-royal hover:underline">{i.invoice_number}</Link></Td>
                    <Td>{i.students.first_name} {i.students.last_name}<p className="text-xs text-muted-foreground">{labelFrom(l.classes, i.students.class_id)}</p></Td>
                    <Td className="text-right tabular-nums">{cedis(i.total)}</Td>
                    <Td className="text-right tabular-nums">{cedis(Math.max(0, Number(i.total) - Number(i.amount_paid)))}</Td>
                    <Td><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {count != null && count > size && <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Showing {from + 1}–{Math.min(to + 1, count)} of {count}. {page * size < count && <Link className="text-royal" href={`${href("invoices")}&page=${page + 1}`}>Next page</Link>}</p>}
        </Card>
        {manage && <Card className="self-start"><CardHeader title="Issue term invoices" /><CardBody><GenerateInvoicesForm terms={l.terms} classes={l.classes} defaultTerm={termId} /></CardBody></Card>}
      </div>
    );
  } else {
    const [{ data: invs }, { data: recent }, { data: year }] = await Promise.all([
      termId ? supabase.from("student_invoices").select("total, amount_paid, status").eq("term_id", termId).neq("status", "cancelled") : Promise.resolve({ data: [] as { total: number; amount_paid: number; status: string }[] }),
      supabase.from("student_payments").select("id, amount, method, receipt_number, received_at, status, students(first_name, last_name)").eq("school_id", school.schoolId).order("received_at", { ascending: false }).limit(10)
        .returns<{ id: string; amount: number; method: string; receipt_number: string; received_at: string; status: string; students: { first_name: string; last_name: string } }[]>(),
      supabase.from("academic_years").select("id, name, starts_on, ends_on").eq("school_id", school.schoolId).eq("is_current", true).maybeSingle(),
    ]);
    const billed = (invs ?? []).reduce((n, i) => n + Number(i.total), 0);
    const collected = (invs ?? []).reduce((n, i) => n + Number(i.amount_paid), 0);
    const [{ data: spend }, { data: budgets }] = year
      ? await Promise.all([
          supabase.from("expenditure_records").select("category, amount").eq("school_id", school.schoolId).gte("spent_on", year.starts_on).lte("spent_on", year.ends_on),
          supabase.from("school_budgets").select("category, amount").eq("academic_year_id", year.id),
        ])
      : [{ data: [] as { category: string; amount: number }[] }, { data: [] as { category: string; amount: number }[] }];
    const actual = new Map<string, number>();
    for (const s of spend ?? []) actual.set(s.category, (actual.get(s.category) ?? 0) + Number(s.amount));
    const cats = [...new Set([...(budgets ?? []).map((b) => b.category), ...actual.keys()])];
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Billed this term" value={null} display={cedis(billed)} icon={Receipt} />
          <StatCard label="Collected" value={null} display={cedis(collected)} icon={Wallet} tone="success" />
          <StatCard label="Outstanding" value={null} display={cedis(billed - collected)} icon={CircleDollarSign} tone="warning" />
          <StatCard label="Collection rate" value={null} display={billed ? `${Math.round((collected / billed) * 100)}%` : "—"} icon={Banknote} tone="primary" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Recent payments" />
            {!recent?.length ? <EmptyState title="No payments yet" /> : (
              <ul className="divide-y divide-border">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span><Link href={`/school/finance/receipts/${p.id}`} className="font-medium hover:text-royal hover:underline">{p.students.first_name} {p.students.last_name}</Link><span className="block text-xs text-muted-foreground">{p.receipt_number} · {METHOD_LABEL[p.method]} · {formatDate(p.received_at)}</span></span>
                    <span className={cn("tabular-nums", p.status === "reversed" && "text-muted-foreground line-through")}>{cedis(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title={`Budget vs spending${year ? ` · ${year.name}` : ""}`} />
            {!cats.length ? <EmptyState title="No budget or spending recorded" /> : (
              <Table>
                <thead><tr><Th>Category</Th><Th className="text-right">Budget</Th><Th className="text-right">Spent</Th></tr></thead>
                <tbody>
                  {cats.map((c) => {
                    const b = Number((budgets ?? []).find((x) => x.category === c)?.amount ?? 0);
                    const a = actual.get(c) ?? 0;
                    return <tr key={c}><Td className="capitalize">{c.replace("_", " ")}</Td><Td className="text-right tabular-nums">{b ? cedis(b) : "—"}</Td><Td className={cn("text-right tabular-nums", b && a > b && "text-danger")}>{cedis(a)}</Td></tr>;
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Finance" description="Fees in Ghana cedis, invoices, payments, expenditure and budgets." />
      <form className="mb-4 flex gap-3">
        <input type="hidden" name="tab" value={tab} />
        <Select name="term" defaultValue={termId ?? ""} aria-label="Term" className="sm:w-56">{l.terms.map((t) => <option key={t.value} value={t.value}>{t.label}{t.isCurrent ? " (current)" : ""}</option>)}</Select>
        <button type="submit" className={buttonClass("secondary")}>Show</button>
      </form>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Finance sections">
        {TABS.map((t) => <Link key={t.key} href={href(t.key)} aria-current={t.key === tab ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", t.key === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>)}
      </nav>
      {body}
    </>
  );
}
