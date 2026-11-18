import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Textarea } from "@/components/ui/primitives";
import { replyTicket } from "@/app/support-actions";
import { cn, formatDate } from "@/lib/utils";

export type TicketMessage = { id: string; body: string; from_staff: boolean; is_internal: boolean; created_at: string; author: string };

/** Conversation on a support ticket. Internal notes are only ever returned to support staff (RLS). */
export function TicketThread({ ticketId, messages, staff, closed }: { ticketId: string; messages: TicketMessage[]; staff: boolean; closed: boolean }) {
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "rounded-lg border p-4 text-sm",
              m.is_internal ? "border-warning/40 bg-warning-soft" : m.from_staff ? "border-royal/30 bg-primary-soft" : "border-border bg-surface",
            )}
          >
            <p className="mb-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{m.author}</span> · {formatDate(m.created_at, { dateStyle: "medium", timeStyle: "short" })}
              {m.is_internal && " · internal note"}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {closed ? (
        <p className="text-sm text-muted-foreground">This request is closed. Open a new one if you need more help.</p>
      ) : (
        <ActionForm action={replyTicket}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <Textarea name="body" rows={4} maxLength={5000} required aria-label="Reply" placeholder="Write a reply…" />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm">Send reply</SubmitButton>
            {staff && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" className="h-4 w-4 accent-[var(--royal)]" /> Internal note (not shown to the requester)</label>}
          </div>
          <p className="text-xs text-muted-foreground">Please don&apos;t paste passwords or full student records here.</p>
        </ActionForm>
      )}
    </div>
  );
}
