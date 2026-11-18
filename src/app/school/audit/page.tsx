import type { Metadata } from "next";

import { AuditTable, type AuditRow } from "@/components/dashboard/audit-table";
import { PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { pageRange } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

export default async function SchoolAudit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { school } = await requireSchoolPermission("school.audit.read");
  const { page, from, to, size } = pageRange((await searchParams).page, 50);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_id, action, summary, entity_type, profiles(full_name, email)", { count: "exact" })
    .eq("school_id", school.schoolId)
    .order("created_at", { ascending: false })
    .range(from, to)
    .returns<AuditRow[]>();
  return (
    <>
      <PageHeader title="Audit log" description="Who changed what in this school, including actions by platform staff. Entries cannot be edited or deleted." />
      <AuditTable rows={data ?? []} total={count ?? 0} page={page} size={size} basePath="/school/audit" />
    </>
  );
}
