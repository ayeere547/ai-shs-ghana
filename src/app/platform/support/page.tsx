import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import { pageRange } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, TICKET_CATEGORIES, TICKET_PRIORITY, TICKET_STATUS } from "@/lib/support";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Support" };

type Row = { id: string; reference: string; subject: string; category: string; priority: string; status: string; last_activity_at: string; assigned_to: string | null; schools: { name: string } | null };
const ACTIVE = ["open", "in_progress", "waiting_on_requester"];

export default async function SupportDesk({ searchParams }: { searchParams: Promise<{ view?: string; category?: string; page?: string }> }) {
  const session = await requirePlatformPermission("support.manage");
  const params = await searchParams;
  const view = ["active", "mine", "unassigned", "done"].includes(params.view ?? "") ? params.view! : "active";
  const { page, from, to } = pageRange(params.page, 50);
  const supabase = await createClient();
  let q = supabase.from("support_tickets").select("id, reference, subject, category, priority, status, last_activity_at, assigned_to, schools(name)", { count: "exact" });
  if (view === "done") q = q.in("status", ["resolved", "closed"]);
  else q = q.in("status", ACTIVE);
  if (view === "mine") q = q.eq("assigned_to", session.userId);
  if (view === "unassigned") q = q.is("assigned_to", null);
  if (params.category && TICKET_CATEGORIES.some((c) => c.value === params.category)) q = q.eq("category", params.category);
  const { data, count } = await q.order("last_activity_at", { ascending: view === "done" ? false : true }).range(from, to).returns<Row[]>();
  const pages = Math.max(1, Math.ceil((count ?? 0) / 50));

  return (
    <>
      <PageHeader title="Support" description="Requests from schools and users. Oldest activity first, so nothing waits too long." />
      <Card>
        <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search">
          <Select name="view" defaultValue={view} aria-label="View" className="sm:w-48">
            <option value="active">All open</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option><option value="done">Resolved & closed</option>
          </Select>
          <Select name="category" defaultValue={params.category ?? ""} aria-label="Topic" className="sm:w-72">
            <option value="">All topics</option>{TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <button type="submit" className={buttonClass("secondary")}>Filter</button>
        </form>
        {!data?.length ? <EmptyState icon={LifeBuoy} title="Nothing here" /> : (
          <Table>
            <thead><tr><Th>Request</Th><Th>School</Th><Th>Priority</Th><Th>Status</Th><Th>Last activity</Th></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <Td><Link href={`/platform/support/${t.id}`} className="font-medium hover:underline">{t.subject}</Link><span className="block text-xs text-muted-foreground">{t.reference} · {categoryLabel(t.category)}</span></Td>
                  <Td className="text-sm">{t.schools?.name ?? "—"}</Td>
                  <Td><Badge tone={TICKET_PRIORITY[t.priority]?.tone}>{TICKET_PRIORITY[t.priority]?.label}</Badge></Td>
                  <Td><Badge tone={TICKET_STATUS[t.status]?.tone}>{t.status === "waiting_on_requester" ? "Waiting on requester" : TICKET_STATUS[t.status]?.label}</Badge>{!t.assigned_to && ACTIVE.includes(t.status) && <span className="block text-xs text-muted-foreground">Unassigned</span>}</Td>
                  <Td className="text-xs">{formatDate(t.last_activity_at, { dateStyle: "medium", timeStyle: "short" })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {pages > 1 && (
          <div className="flex justify-between border-t border-border px-5 py-3 text-sm">
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <span className="flex gap-3">
              {page > 1 && <Link className="text-royal hover:underline" href={`/platform/support?view=${view}&page=${page - 1}${params.category ? `&category=${params.category}` : ""}`}>Previous</Link>}
              {page < pages && <Link className="text-royal hover:underline" href={`/platform/support?view=${view}&page=${page + 1}${params.category ? `&category=${params.category}` : ""}`}>Next</Link>}
            </span>
          </div>
        )}
      </Card>
    </>
  );
}
