import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateTicket } from "@/app/support-actions";
import { TicketThread, type TicketMessage } from "@/components/support/thread";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, Field, PageHeader, Select } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, TICKET_PRIORITY, TICKET_STATUS } from "@/lib/support";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Support request" };

type Ticket = { id: string; reference: string; subject: string; category: string; priority: string; status: string; school_id: string | null; requester_id: string; assigned_to: string | null; created_at: string; schools: { name: string } | null };

export default async function DeskTicket({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformPermission("support.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("support_tickets").select("id, reference, subject, category, priority, status, school_id, requester_id, assigned_to, created_at, schools(name)").eq("id", id).maybeSingle<Ticket>();
  if (!t) notFound();
  const [{ data: msgs }, { data: requester }, { data: staffRole }] = await Promise.all([
    supabase.from("support_messages").select("id, body, from_staff, is_internal, created_at, author_id").eq("ticket_id", id).order("created_at"),
    supabase.from("profiles").select("full_name, email").eq("id", t.requester_id).maybeSingle(),
    // Support staff list for assignment: role holders of support.manage (names only).
    createAdminClient().from("role_permissions").select("role_id").eq("permission_key", "support.manage"),
  ]);
  const roleIds = (staffRole ?? []).map((r) => r.role_id);
  const { data: staff } = roleIds.length
    ? await createAdminClient().from("platform_users").select("user_id, profiles(full_name, email)").in("role_id", roleIds).returns<{ user_id: string; profiles: { full_name: string | null; email: string } | null }[]>()
    : { data: [] };
  const names = new Map((staff ?? []).map((s) => [s.user_id, s.profiles?.full_name || s.profiles?.email || "Support"]));
  const messages: TicketMessage[] = (msgs ?? []).map((m) => ({
    ...m,
    author: m.from_staff ? `${names.get(m.author_id ?? "") ?? "Support"} (support)` : m.author_id === t.requester_id ? (requester?.full_name || requester?.email || "Requester") : "School colleague",
  }));

  return (
    <>
      <Link href="/platform/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Support</Link>
      <PageHeader title={t.subject} description={`${t.reference} · ${categoryLabel(t.category)} · opened ${formatDate(t.created_at, { dateStyle: "medium", timeStyle: "short" })}`}
        actions={<><Badge tone={TICKET_PRIORITY[t.priority]?.tone}>{TICKET_PRIORITY[t.priority]?.label}</Badge><Badge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</Badge></>} />
      {t.category === "data_protection" && (
        <Alert tone="warning" className="mb-6" title="Data protection request (Act 843)">Confirm the requester&apos;s identity and authority before sharing, correcting or deleting personal data, and record what was done here.</Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card><CardBody><TicketThread ticketId={t.id} messages={messages} staff closed={t.status === "closed"} /></CardBody></Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Requester" />
            <CardBody className="space-y-1 text-sm">
              <p className="font-medium">{requester?.full_name ?? "—"}</p>
              <p className="text-muted-foreground">{requester?.email}</p>
              {t.school_id ? <Link href={`/platform/schools/${t.school_id}`} className="text-royal hover:underline">{t.schools?.name}</Link> : <p className="text-muted-foreground">No school</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Manage" />
            <CardBody>
              <form action={updateTicket} className="space-y-3">
                <input type="hidden" name="ticketId" value={t.id} />
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={t.status}>{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{k === "waiting_on_requester" ? "Waiting on requester" : v.label}</option>)}</Select>
                </Field>
                <Field label="Priority" htmlFor="priority">
                  <Select id="priority" name="priority" defaultValue={t.priority}>{Object.entries(TICKET_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
                </Field>
                <Field label="Assigned to" htmlFor="assignee">
                  <Select id="assignee" name="assignee" defaultValue={t.assigned_to ?? ""}>
                    <option value="">{t.assigned_to ? "Keep current" : "Unassigned"}</option>
                    {[...names].map(([uid, n]) => <option key={uid} value={uid}>{n}{uid === session.userId ? " (me)" : ""}</option>)}
                  </Select>
                </Field>
                <SubmitButton size="sm">Update</SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
