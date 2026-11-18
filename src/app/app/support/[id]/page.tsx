import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateTicket } from "@/app/support-actions";
import { TicketThread, type TicketMessage } from "@/components/support/thread";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, TICKET_STATUS } from "@/lib/support";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Support request" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("id, reference, subject, category, status, requester_id, created_at, schools(name)").eq("id", id)
    .maybeSingle<{ id: string; reference: string; subject: string; category: string; status: string; requester_id: string; created_at: string; schools: { name: string } | null }>();
  if (!t) notFound();
  const { data: msgs } = await supabase.from("support_messages").select("id, body, from_staff, is_internal, created_at, author_id").eq("ticket_id", id).order("created_at");
  const mine = t.requester_id === session.userId;
  const messages: TicketMessage[] = (msgs ?? []).map((m) => ({ ...m, author: m.from_staff ? "AI SHS Ghana support" : m.author_id === session.userId ? "You" : "School" }));
  const done = t.status === "resolved" || t.status === "closed";

  return (
    <>
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Help & support</Link>
      <PageHeader title={t.subject} description={`${t.reference} · ${categoryLabel(t.category)}${t.schools ? ` · ${t.schools.name}` : ""} · opened ${formatDate(t.created_at)}`}
        actions={<Badge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <Card><CardBody><TicketThread ticketId={t.id} messages={messages} staff={false} closed={t.status === "closed"} /></CardBody></Card>
        {mine && t.status !== "closed" && (
          <Card className="self-start">
            <CardHeader title="Finished?" />
            <CardBody className="space-y-2">
              {!done && (
                <form action={updateTicket}>
                  <input type="hidden" name="ticketId" value={t.id} />
                  <input type="hidden" name="status" value="resolved" />
                  <button type="submit" className="text-sm font-medium text-royal hover:underline">Mark as resolved</button>
                </form>
              )}
              <form action={updateTicket}>
                <input type="hidden" name="ticketId" value={t.id} />
                <input type="hidden" name="status" value="closed" />
                <ConfirmSubmit title="Close this request?" description="You won't be able to reply to it afterwards." confirmLabel="Close">Close request</ConfirmSubmit>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
