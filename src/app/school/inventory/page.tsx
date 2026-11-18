import type { Metadata } from "next";
import Link from "next/link";

import { ResourceManager } from "@/components/school/resource-manager";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

import { moveStock } from "../operations/actions";

export const metadata: Metadata = { title: "Stores & assets" };

type Move = { id: string; kind: string; quantity: number; note: string | null; created_at: string; inventory_items: { name: string; unit: string } };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { school } = await requireSchoolPermission("inventory.manage");
  const params = await searchParams;
  const tab = params.tab === "assets" ? "assets" : "stock";
  const manage = school.schoolStatus === "active";

  let body: React.ReactNode;
  if (tab === "assets") {
    body = <ResourceManager resource="assets" schoolId={school.schoolId} canManage={manage} editId={params.edit} hrefFor={(id) => `/school/inventory?tab=assets${id ? `&edit=${id}` : ""}`} />;
  } else {
    const supabase = await createClient();
    const [{ data: items }, { data: moves }] = await Promise.all([
      supabase.from("inventory_items").select("id, name, unit, quantity, reorder_level").eq("school_id", school.schoolId).order("name"),
      supabase.from("inventory_transactions").select("id, kind, quantity, note, created_at, inventory_items(name, unit)").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(15).returns<Move[]>(),
    ]);
    const low = (items ?? []).filter((i) => Number(i.quantity) <= Number(i.reorder_level));
    body = (
      <div className="space-y-6">
        {low.length > 0 && <Card><CardBody className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">Running low:</span>{low.map((i) => <Badge key={i.id} tone="warning">{i.name} ({Number(i.quantity)} {i.unit})</Badge>)}</CardBody></Card>}
        <ResourceManager resource="stock" schoolId={school.schoolId} canManage={manage} editId={params.edit} hrefFor={(id) => `/school/inventory?tab=stock${id ? `&edit=${id}` : ""}`} />
        {manage && (items ?? []).length > 0 && (
          <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
            <Card className="self-start">
              <CardHeader title="Stock movement" />
              <CardBody>
                <ActionForm action={moveStock}>
                  <Field label="Item" htmlFor="sm-item"><Select id="sm-item" name="itemId">{(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name} ({Number(i.quantity)} {i.unit})</option>)}</Select></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type" htmlFor="sm-kind"><Select id="sm-kind" name="kind" defaultValue="out"><option value="in">Received</option><option value="out">Issued</option><option value="adjust">Stock count</option></Select></Field>
                    <Field label="Quantity" htmlFor="sm-qty"><Input id="sm-qty" name="quantity" type="number" step="0.01" min="0.01" /></Field>
                  </div>
                  <Field label="Note (optional)" htmlFor="sm-note"><Input id="sm-note" name="note" placeholder="e.g. issued to Form 1 Science" maxLength={200} /></Field>
                  <SubmitButton>Record</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Recent movements" />
              <ul className="divide-y divide-border">
                {(moves ?? []).map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 px-5 py-2 text-sm">
                    <span>{m.inventory_items.name}{m.note ? <span className="text-muted-foreground"> · {m.note}</span> : ""}<span className="block text-xs text-muted-foreground">{formatDate(m.created_at, { dateStyle: "medium", timeStyle: "short" })}</span></span>
                    <span className="tabular-nums">{m.kind === "in" ? "+" : m.kind === "out" ? "−" : "="}{Number(m.quantity)} {m.inventory_items.unit}</span>
                  </li>
                ))}
                {!moves?.length && <li className="px-5 py-3 text-sm text-muted-foreground">No movements yet.</li>}
              </ul>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Stores & assets" description="Consumable stock with a full movement history, and tagged school property. Faults are reported under Maintenance." />
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Sections">
        {[["stock", "Stores"], ["assets", "Assets"]].map(([k, label]) => <Link key={k} href={`/school/inventory?tab=${k}`} aria-current={k === tab ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", k === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>)}
      </nav>
      {body}
    </>
  );
}
