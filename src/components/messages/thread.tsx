"use client";

import { useActionState, useEffect, useRef } from "react";

import { sendFamilyMessage } from "@/app/messages-actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/validation/auth";

export type ThreadMessage = { id: string; body: string; from_family: boolean; created_at: string; mine: boolean; author: string };

/** A child's family–school conversation. `viewer` decides which side is "mine". */
export function FamilyThread({ studentId, messages, emptyText }: { studentId: string; messages: ThreadMessage[]; emptyText: string }) {
  const [state, action] = useActionState(sendFamilyMessage, {} as FormState);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.ok && ref.current) ref.current.value = "";
  }, [state]);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="space-y-4">
      <ol className="max-h-[28rem] space-y-3 overflow-y-auto">
        {!messages.length && <li className="text-sm text-muted-foreground">{emptyText}</li>}
        {messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-lg px-4 py-2.5 text-sm", m.mine ? "ml-auto bg-primary text-primary-foreground" : "bg-surface-muted")}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={cn("mt-1 text-[11px]", m.mine ? "text-white/70" : "text-muted-foreground")}>{m.mine ? "You" : m.author} · {fmt.format(new Date(m.created_at))}</p>
          </li>
        ))}
      </ol>
      <form action={action} className="space-y-2">
        <input type="hidden" name="studentId" value={studentId} />
        <textarea ref={ref} name="body" rows={3} maxLength={3000} aria-label="Message" placeholder="Write a message…" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        {state.message && !state.ok && <p className="text-xs text-danger">{state.message}</p>}
        <SubmitButton size="sm">Send</SubmitButton>
      </form>
    </div>
  );
}
