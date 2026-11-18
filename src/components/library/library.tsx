import { BookMarked, ExternalLink, FileText } from "lucide-react";

import { deleteResource } from "@/app/school/library/actions";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, EmptyState, Input, Select } from "@/components/ui/primitives";
import type { Option } from "@/lib/school/lookups";

export const LIBRARY_KINDS = [
  { value: "ebook", label: "E-book" },
  { value: "document", label: "Document" },
  { value: "video", label: "Video" },
  { value: "link", label: "Website" },
  { value: "past_questions", label: "Past questions" },
] as const;

export type Resource = { id: string; title: string; author: string | null; description: string | null; kind: string; subject_id: string | null; form_level: number | null; url: string | null; file_path: string | null; source: string; licence_note: string | null; audience: string };

const SOURCE: Record<string, { label: string; tone: "success" | "info" | "neutral" }> = {
  licensed_official: { label: "Licensed official material", tone: "success" },
  open_licence: { label: "Openly licensed", tone: "info" },
  school: { label: "School resource", tone: "neutral" },
};

/** Searchable library listing shared by the staff and student views. */
export function LibraryBrowser({ basePath, items, files, subjects, params, manage }: { basePath: string; items: Resource[]; files: Map<string, string>; subjects: Option[]; params: { q?: string; subject?: string; kind?: string }; manage?: boolean }) {
  return (
    <Card>
      <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search" action={basePath}>
        <Input name="q" defaultValue={params.q} placeholder="Search title or author…" aria-label="Search the library" className="sm:max-w-xs" />
        <Select name="subject" defaultValue={params.subject ?? ""} aria-label="Subject" className="sm:w-48"><option value="">All subjects</option>{subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        <Select name="kind" defaultValue={params.kind ?? ""} aria-label="Type" className="sm:w-44"><option value="">All types</option>{LIBRARY_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
        <button type="submit" className={buttonClass("secondary")}>Search</button>
      </form>
      {!items.length ? (
        <EmptyState icon={BookMarked} title="Nothing found">{manage ? "Add e-books, documents, videos and links your students can use." : "Try another search."}</EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => {
            const href = r.file_path ? files.get(r.file_path) : r.url;
            return (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{[LIBRARY_KINDS.find((k) => k.value === r.kind)?.label, r.author, subjects.find((s) => s.value === r.subject_id)?.label, r.form_level ? `Form ${r.form_level}` : null].filter(Boolean).join(" · ")}</p>
                  {r.description && <p className="mt-1 text-muted-foreground">{r.description}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={SOURCE[r.source].tone} title={r.licence_note ?? undefined}>{SOURCE[r.source].label}</Badge>
                    {r.audience === "staff" && <Badge tone="warning">Staff only</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={buttonClass("secondary", "sm")}>{r.file_path ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />} Open</a>}
                  {manage && <form action={deleteResource}><input type="hidden" name="id" value={r.id} /><ConfirmSubmit title="Remove from library?" description="Students will no longer see it. Uploaded files are deleted." confirmLabel="Remove">Remove</ConfirmSubmit></form>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
