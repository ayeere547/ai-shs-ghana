import { ScrollText } from "lucide-react";

import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export type AuditRow = {
  id: number;
  created_at: string;
  action: string;
  summary: string | null;
  entity_type: string;
  actor_id: string | null;
  profiles: { full_name: string | null; email: string } | null;
  schools?: { name: string } | null;
};

/** Read-only audit log table shared by the platform and school consoles. */
export function AuditTable({ rows, total, page, size, basePath, showSchool = false }: { rows: AuditRow[]; total: number; page: number; size: number; basePath: string; showSchool?: boolean }) {
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No activity recorded yet" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                {showSchool && <Th className="hidden lg:table-cell">School</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDate(r.created_at, { dateStyle: "medium", timeStyle: "short" })}</Td>
                  <Td>{r.profiles ? (r.profiles.full_name ?? r.profiles.email) : <span className="text-muted-foreground">{r.actor_id ? "Account not visible to you" : "System"}</span>}</Td>
                  <Td>
                    <p className="font-mono text-xs text-muted-foreground">{r.action}</p>
                    {r.summary && <p>{r.summary}</p>}
                  </Td>
                  {showSchool && <Td className="hidden text-muted-foreground lg:table-cell">{r.schools?.name ?? "—"}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} size={size} total={total} basePath={basePath} params={{}} />
        </>
      )}
    </Card>
  );
}
