import { BriefcaseBusiness, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { pageRange, searchTerm } from "@/lib/schools";
import { EMPLOYMENT_STATUSES, staffName } from "@/lib/staff/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Staff" };

type Row = { id: string; staff_number: string; title: string | null; first_name: string; last_name: string; job_title: string; department_id: string | null; is_teaching: boolean; employment_status: string; user_id: string | null };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string; department?: string; status?: string; page?: string }> }) {
  const { school } = await requireSchoolPermission("staff.read");
  const params = await searchParams;
  const { page, from, to, size } = pageRange(params.page, 25);
  const l = await schoolLookups(school.schoolId);
  const q = searchTerm(params.q);
  const department = l.departments.some((d) => d.value === params.department) ? params.department : undefined;
  const status = EMPLOYMENT_STATUSES.some((s) => s.value === params.status) ? params.status : params.status === "all" ? "all" : "active";
  const canManage = school.permissions.has("staff.manage") && school.schoolStatus === "active";

  const supabase = await createClient();
  let query = supabase.from("staff").select("id, staff_number, title, first_name, last_name, job_title, department_id, is_teaching, employment_status, user_id", { count: "exact" }).eq("school_id", school.schoolId);
  if (status !== "all") query = query.eq("employment_status", status);
  if (department) query = query.eq("department_id", department);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,staff_number.ilike.%${q}%,job_title.ilike.%${q}%`);
  const { data, count } = await query.order("last_name").range(from, to).returns<Row[]>();

  return (
    <>
      <PageHeader title="Staff" description="Teaching and non-teaching staff, their departments and teaching assignments." actions={canManage && <ButtonLink href="/school/staff/new"><UserPlus className="h-4 w-4" /> Add staff member</ButtonLink>} />
      <Card>
        <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search">
          <Input name="q" defaultValue={params.q} placeholder="Search name, number or job title…" aria-label="Search staff" className="sm:max-w-xs" />
          <Select name="department" defaultValue={department ?? ""} aria-label="Department" className="sm:w-48">
            <option value="">All departments</option>
            {l.departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status" className="sm:w-40">
            {EMPLOYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            <option value="all">All</option>
          </Select>
          <button type="submit" className={buttonClass("secondary")}>Filter</button>
        </form>
        {!data?.length ? (
          <EmptyState icon={BriefcaseBusiness} title="No staff found" action={canManage && <ButtonLink href="/school/staff/new" size="sm">Add a staff member</ButtonLink>} />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Name</Th><Th className="hidden sm:table-cell">Number</Th><Th>Role</Th><Th className="hidden md:table-cell">Department</Th><Th className="hidden md:table-cell">Account</Th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-muted/60">
                    <Td><Link href={`/school/staff/${s.id}`} className="font-medium hover:text-royal hover:underline">{staffName(s)}</Link></Td>
                    <Td className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{s.staff_number}</Td>
                    <Td className="text-muted-foreground">{s.job_title}{s.is_teaching && <Badge tone="info" className="ml-2">Teaching</Badge>}</Td>
                    <Td className="hidden text-muted-foreground md:table-cell">{labelFrom(l.departments, s.department_id)}</Td>
                    <Td className="hidden md:table-cell">{s.user_id ? <Badge tone="success">Linked</Badge> : <Badge>Not linked</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} size={size} total={count ?? 0} basePath="/school/staff" params={{ q: params.q, department, status }} />
          </>
        )}
      </Card>
    </>
  );
}
