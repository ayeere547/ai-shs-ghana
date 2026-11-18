import type { Metadata } from "next";

import { AuditTable, type AuditRow } from "@/components/dashboard/audit-table";
import { PageHeader } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import { pageRange } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

export default async function PlatformAudit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePlatformPermission("platform.audit.read");
  const { page, from, to, size } = pageRange((await searchParams).page, 50);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_id, action, summary, entity_type, profiles(full_name, email), schools(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<AuditRow[]>();
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sign-ins, verification decisions, role changes and configuration changes. Entries cannot be edited or deleted." />
      <AuditTable rows={data ?? []} total={count ?? 0} page={page} size={size} basePath="/platform/audit" showSchool />
    </>
  );
}
