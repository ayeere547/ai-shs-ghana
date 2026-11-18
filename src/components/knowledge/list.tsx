import { BookOpenCheck } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

import { SOURCE_TYPES } from "./knowledge";

export type KnowledgeDoc = { id: string; title: string; subject_name: string | null; form_level: number | null; source_type: string; is_official: boolean; status: string; chunk_count: number; embedded: boolean; created_at: string; school_id: string | null };

export function KnowledgeList({ docs, onDelete, onReembed, manage, title = "Documents" }: { docs: KnowledgeDoc[]; onDelete: (fd: FormData) => Promise<void>; onReembed: (fd: FormData) => Promise<void>; manage: (d: KnowledgeDoc) => boolean; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} description="Indexed for the AI tutor and teaching tools. Smart (semantic) search needs AI to be configured; keyword search always works." />
      {!docs.length ? (
        <EmptyState icon={BookOpenCheck} title="No documents yet">Add curriculum documents, notes and textbook extracts the AI should draw on.</EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">{[SOURCE_TYPES.find((t) => t.value === d.source_type)?.label, d.subject_name ?? "All subjects", d.form_level ? `Form ${d.form_level}` : null, `${d.chunk_count} sections`, formatDate(d.created_at)].filter(Boolean).join(" · ")}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.is_official && <Badge tone="success">Official</Badge>}
                  {d.school_id === null && <Badge tone="info">Platform-wide</Badge>}
                  {d.status !== "ready" ? <Badge tone="danger">{d.status}</Badge> : d.embedded ? <Badge tone="success">Smart search</Badge> : <Badge tone="warning">Keyword search only</Badge>}
                </div>
              </div>
              {manage(d) && (
                <div className="flex gap-2">
                  {!d.embedded && d.status === "ready" && <form action={onReembed}><input type="hidden" name="id" value={d.id} /><button type="submit" className={buttonClass("secondary", "sm")}>Index for smart search</button></form>}
                  <form action={onDelete}><input type="hidden" name="id" value={d.id} /><ConfirmSubmit title="Remove document?" description="The AI will stop using it." confirmLabel="Remove">Remove</ConfirmSubmit></form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
