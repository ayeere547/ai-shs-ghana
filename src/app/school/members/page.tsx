import { Users } from "lucide-react";
import type { Metadata } from "next";

import { InviteForm } from "@/components/school/invite-form";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { assignableSchoolRoles, SCHOOL_ROLES } from "@/lib/auth/permissions";
import { requireSchoolPermission } from "@/lib/auth/session";
import { pageRange, searchTerm } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { updateMember } from "./actions";

export const metadata: Metadata = { title: "Staff & members" };

type Row = { id: string; user_id: string; created_at: string; roles: { key: string; label: string; rank: number }; profiles: { full_name: string | null; email: string; phone: string | null } };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const { session, school } = await requireSchoolPermission("members.read");
  const params = await searchParams;
  const { page, from, to, size } = pageRange(params.page);
  const q = searchTerm(params.q);
  const role = SCHOOL_ROLES.some((r) => r.key === params.role) ? params.role : undefined;
  const canManage = school.permissions.has("members.manage") && school.schoolStatus === "active";

  const supabase = await createClient();
  let query = supabase
    .from("school_memberships")
    .select("id, user_id, created_at, roles!inner(key, label, rank), profiles!school_memberships_user_id_fkey!inner(full_name, email, phone)", { count: "exact" })
    .eq("school_id", school.schoolId)
    .eq("status", "active");
  if (role) query = query.eq("roles.key", role);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`, { referencedTable: "profiles" });
  const { data, count } = await query.order("created_at").range(from, to).returns<Row[]>();
  const assignable = assignableSchoolRoles(school.rank);

  return (
    <>
      <PageHeader title="Staff & members" description="Everyone with access to this school, and their role. Roles decide what each person can see and do." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search">
            <Input name="q" defaultValue={params.q} placeholder="Search name or email…" aria-label="Search members" className="sm:max-w-xs" />
            <Select name="role" defaultValue={role ?? ""} aria-label="Filter by role" className="sm:w-56">
              <option value="">All roles</option>
              {SCHOOL_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
            <button type="submit" className={buttonClass("secondary")}>Filter</button>
          </form>
          {!data?.length ? (
            <EmptyState icon={Users} title="No members found" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Role</Th>
                    <Th className="hidden md:table-cell">Added</Th>
                    {canManage && <Th className="text-right"><span className="sr-only">Actions</span></Th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((m) => {
                    const self = m.user_id === session.userId;
                    const manageable = canManage && !self && m.roles.rank <= school.rank;
                    return (
                      <tr key={m.id}>
                        <Td>
                          <p className="font-medium">{m.profiles.full_name ?? "—"} {self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}</p>
                          <p className="text-xs text-muted-foreground">{m.profiles.email}</p>
                        </Td>
                        <Td>
                          {manageable ? (
                            <form action={updateMember} className="flex items-center gap-2">
                              <input type="hidden" name="membershipId" value={m.id} />
                              <Select name="role" defaultValue={m.roles.key} aria-label={`Role for ${m.profiles.email}`} className="h-8 w-48 text-xs">
                                {assignable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                              </Select>
                              <button type="submit" className={buttonClass("ghost", "sm")}>Save</button>
                            </form>
                          ) : (
                            <Badge tone={m.roles.key === "headteacher" ? "primary" : "neutral"}>{m.roles.label}</Badge>
                          )}
                        </Td>
                        <Td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDate(m.created_at)}</Td>
                        {canManage && (
                          <Td className="text-right">
                            {manageable && (
                              <form action={updateMember}>
                                <input type="hidden" name="membershipId" value={m.id} />
                                <input type="hidden" name="status" value="removed" />
                                <ConfirmSubmit title="Remove member?" description={`${m.profiles.email} will immediately lose access to ${school.schoolName}. Their account is not deleted.`} confirmLabel="Remove">
                                  Remove
                                </ConfirmSubmit>
                              </form>
                            )}
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={page} size={size} total={count ?? 0} basePath="/school/members" params={{ q: params.q, role }} />
            </>
          )}
        </Card>
        {canManage && (
          <Card className="self-start">
            <CardHeader title="Add a member" description="Existing accounts are added immediately; new people receive an invitation email." />
            <CardBody>
              <InviteForm roles={assignable.map(({ key, label }) => ({ key, label }))} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
