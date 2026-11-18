import type { Metadata } from "next";

import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { assignablePlatformRoles } from "@/lib/auth/permissions";
import { requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { revokePlatformRole } from "./actions";
import { GrantForm } from "./grant-form";

export const metadata: Metadata = { title: "Platform staff" };

type Row = { user_id: string; created_at: string; roles: { key: string; label: string; rank: number } | null; profiles: { full_name: string | null; email: string } | null };

export default async function PlatformUsers() {
  const session = await requirePlatformPermission("platform.users.manage");
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_users")
    .select("user_id, created_at, roles(key, label, rank), profiles!platform_users_user_id_fkey(full_name, email)")
    .order("created_at")
    .returns<Row[]>();
  const myRank = session.platform!.rank;

  return (
    <>
      <PageHeader title="Platform staff" description="People with national platform access. Changes are recorded in the audit log." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th className="hidden sm:table-cell">Since</Th>
                <Th className="text-right">Access</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => {
                const self = u.user_id === session.userId;
                const canRevoke = !self && (u.roles?.rank ?? 0) <= myRank;
                return (
                  <tr key={u.user_id}>
                    <Td>
                      <p className="font-medium">{u.profiles?.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.profiles?.email}</p>
                    </Td>
                    <Td><Badge tone="info">{u.roles?.label}</Badge></Td>
                    <Td className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDate(u.created_at)}</Td>
                    <Td className="text-right">
                      {self ? (
                        <span className="text-xs text-muted-foreground">You</span>
                      ) : canRevoke ? (
                        <form action={revokePlatformRole}>
                          <input type="hidden" name="userId" value={u.user_id} />
                          <ConfirmSubmit title="Revoke platform access?" description={`${u.profiles?.email} will lose all national platform access immediately.`} confirmLabel="Revoke access">
                            Revoke
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Grant platform access" description="You can grant roles up to your own level." />
          <CardBody>
            <GrantForm roles={assignablePlatformRoles(myRank).map(({ key, label }) => ({ key, label }))} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
