import { Eye, EyeOff, FileText, Link2, PlayCircle, StickyNote } from "lucide-react";
import type { ReactNode } from "react";

import { deleteAnnouncement, deletePost, moderatePost, updateMaterial } from "@/app/school/classroom/actions";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { fileLabel } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

import { PostForm } from "./forms";

export type Material = { id: string; title: string; kind: string; description: string | null; body: string | null; url: string | null; file_path: string | null; is_published: boolean; created_at: string };

const ICON = { note: StickyNote, video: PlayCircle, document: FileText, link: Link2 } as const;

/** Materials list shared by teacher and student views. Notes render as plain text (never HTML). */
export function MaterialList({ materials, files, manage }: { materials: Material[]; files: Map<string, string>; manage?: boolean }) {
  if (!materials.length) return <EmptyState icon={StickyNote} title="No materials yet">{manage ? "Add notes, videos, documents or links for this class." : "Your teacher hasn't shared anything here yet."}</EmptyState>;
  return (
    <ul className="divide-y divide-border">
      {materials.map((m) => {
        const Icon = ICON[m.kind as keyof typeof ICON] ?? FileText;
        const file = m.file_path ? files.get(m.file_path) : undefined;
        return (
          <li key={m.id} className="px-5 py-4">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className="mt-0.5 rounded-md bg-royal-soft p-1.5 text-royal"><Icon className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.title} {!m.is_published && <Badge tone="warning" className="ml-1">Draft</Badge>}</span>
                  <span className="block text-xs text-muted-foreground">{formatDate(m.created_at)}{m.description ? ` · ${m.description}` : ""}</span>
                </span>
              </summary>
              <div className="mt-3 space-y-3 pl-10 text-sm">
                {m.body && <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>}
                {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-royal hover:underline"><Link2 className="h-4 w-4" /> Open {m.kind === "video" ? "video" : "link"}</a>}
                {file && <a href={file} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-royal hover:underline"><FileText className="h-4 w-4" /> {fileLabel(m.file_path!)}</a>}
                {manage && (
                  <div className="flex gap-2 pt-1">
                    <form action={updateMaterial}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value={m.is_published ? "unpublish" : "publish"} />
                      <button type="submit" className={buttonClass("secondary", "sm")}>{m.is_published ? "Unpublish" : "Publish"}</button>
                    </form>
                    <form action={updateMaterial}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="op" value="delete" />
                      <ConfirmSubmit title="Delete material?" description="Students will no longer see it. Attached files are deleted." confirmLabel="Delete">Delete</ConfirmSubmit>
                    </form>
                  </div>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export type Announcement = { id: string; title: string; body: string; is_urgent: boolean; created_at: string; class_id: string | null; audience: string };

export function AnnouncementList({ items, canDelete, emptyText = "No announcements yet." }: { items: Announcement[]; canDelete?: (a: Announcement) => boolean; emptyText?: ReactNode }) {
  if (!items.length) return <p className="px-5 py-4 text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="px-5 py-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{a.is_urgent && <Badge tone="danger" className="mr-2">Urgent</Badge>}{a.title}</p>
            {canDelete?.(a) && (
              <form action={deleteAnnouncement}>
                <input type="hidden" name="id" value={a.id} />
                <ConfirmSubmit title="Delete announcement?" description="It will be removed for everyone." confirmLabel="Delete">Delete</ConfirmSubmit>
              </form>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(a.created_at, { dateStyle: "medium", timeStyle: "short" })}{a.class_id ? "" : a.audience !== "all" ? ` · ${a.audience} only` : ""}</p>
        </li>
      ))}
    </ul>
  );
}

export type Post = { id: string; parent_id: string | null; author_id: string; body: string; is_hidden: boolean; created_at: string };

/** Discussion thread. Author names come from a map the page builds from what RLS lets the viewer see. */
export function Discussion({ posts, names, me, classId, subjectId, moderate }: { posts: Post[]; names: Map<string, string>; me: string; classId: string; subjectId: string; moderate?: boolean }) {
  const top = posts.filter((p) => !p.parent_id);
  const replies = (id: string) => posts.filter((p) => p.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const item = (p: Post) => (
    <div className={p.is_hidden ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{p.author_id === me ? "You" : (names.get(p.author_id) ?? "Classmate")}</span> · {formatDate(p.created_at, { dateStyle: "medium", timeStyle: "short" })}{p.is_hidden && <Badge tone="warning" className="ml-2">Hidden by teacher</Badge>}</p>
        <div className="flex gap-1">
          {moderate && (
            <form action={moderatePost}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="hide" value={p.is_hidden ? "0" : "1"} />
              <button type="submit" className="rounded p-1 text-muted-foreground hover:bg-surface-muted" aria-label={p.is_hidden ? "Show post" : "Hide post"} title={p.is_hidden ? "Show post" : "Hide post"}>
                {p.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </form>
          )}
          {(moderate || p.author_id === me) && (
            <form action={deletePost}>
              <input type="hidden" name="id" value={p.id} />
              <ConfirmSubmit title="Delete post?" description="This removes the post and its replies." confirmLabel="Delete">Delete</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
    </div>
  );
  return (
    <div className="space-y-4">
      <PostForm classId={classId} subjectId={subjectId} />
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-3">
          {top.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-4">
              {item(p)}
              <ul className="mt-3 space-y-3 border-l-2 border-border pl-4">
                {replies(p.id).map((r) => <li key={r.id}>{item(r)}</li>)}
              </ul>
              {!p.is_hidden && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-royal">Reply</summary><div className="mt-2"><PostForm classId={classId} subjectId={subjectId} parentId={p.id} placeholder="Write a reply…" /></div></details>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Be kind and stay on topic. Teachers can hide posts that break school rules.</p>
    </div>
  );
}
