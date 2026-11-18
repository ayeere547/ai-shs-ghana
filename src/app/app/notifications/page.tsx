import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { markAllNotificationsRead } from "@/app/app/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireSession();
  const supabase = await createClient();
  const { data: items } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const unread = (items ?? []).some((n) => !n.read_at);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your schools and account."
        actions={
          unread && (
            <form action={markAllNotificationsRead}>
              <SubmitButton variant="secondary" size="sm">Mark all as read</SubmitButton>
            </form>
          )
        }
      />
      <Card>
        {!items?.length ? (
          <EmptyState icon={Bell} title="No notifications yet">Verification decisions, invitations and school updates will appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const body = (
                <div className="flex gap-3 px-5 py-4">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-royal")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at, { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={safeNextPath(n.link)} className="block hover:bg-surface-muted">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
