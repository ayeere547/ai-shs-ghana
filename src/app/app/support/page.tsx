import { LifeBuoy, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, TICKET_STATUS } from "@/lib/support";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Help & support" };

type Ticket = { id: string; reference: string; subject: string; category: string; status: string; last_activity_at: string; requester_id: string; schools: { name: string } | null };

export default async function SupportList() {
  const session = await requireSession();
  const supabase = await createClient();
  // RLS: your own requests, plus your school's if you administer it.
  const { data } = await supabase.from("support_tickets").select("id, reference, subject, category, status, last_activity_at, requester_id, schools(name)")
    .order("last_activity_at", { ascending: false }).limit(100).returns<Ticket[]>();

  return (
    <>
      <PageHeader
        title="Help & support"
        description="Ask the AI SHS Ghana team for help. Replies appear here and in your notifications."
        actions={<Link href="/app/support/new" className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" /> New request</Link>}
      />
      <Card>
        {!data?.length ? (
          <EmptyState icon={LifeBuoy} title="No support requests" action={<Link href="/app/support/new" className={buttonClass("secondary", "sm")}>Ask for help</Link>}>
            You can also browse the <Link href="/help" className="text-royal hover:underline">help centre</Link>.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((t) => (
              <li key={t.id}>
                <Link href={`/app/support/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.subject}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.reference} · {categoryLabel(t.category)}{t.schools ? ` · ${t.schools.name}` : ""}{t.requester_id !== session.userId ? " · raised by a colleague" : ""} · {formatDate(t.last_activity_at)}
                    </span>
                  </span>
                  <Badge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
