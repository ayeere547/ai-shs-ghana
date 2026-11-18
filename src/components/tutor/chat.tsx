"use client";

import { ImagePlus, Loader2, Mic, MicOff, Send, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { sendMessage } from "@/app/student/tutor/actions";
import { Alert } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60" aria-label="Send">
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
    </button>
  );
}

function Thinking() {
  const { pending } = useFormStatus();
  return pending ? <p className="px-1 text-sm text-muted-foreground">Tutor is thinking…</p> : null;
}

/** Message composer with optional photo of the question and voice dictation (where the browser supports it). */
export function TutorComposer({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessage, {} as FormState);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setCanDictate(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);
  useEffect(() => {
    if (state.ok && textRef.current) {
      textRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
      setImageName(null);
    }
  }, [state]);

  const dictate = () => {
    if (listening) return recRef.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GH";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      if (textRef.current) textRef.current.value = `${textRef.current.value} ${said}`.trim();
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      <Thinking />
      {imageName && (
        <p className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1 text-xs">
          {imageName}
          <button type="button" aria-label="Remove image" onClick={() => { if (fileRef.current) fileRef.current.value = ""; setImageName(null); }}><X className="h-3.5 w-3.5" /></button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-muted" title="Attach a photo of the question">
          <ImagePlus className="h-5 w-5" aria-hidden />
          <span className="sr-only">Attach a photo of the question</span>
          <input ref={fileRef} type="file" name="image" accept="image/png,image/jpeg,image/webp" capture="environment" className="sr-only" onChange={(e) => setImageName(e.target.files?.[0]?.name ?? null)} />
        </label>
        {canDictate && (
          <button type="button" onClick={dictate} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-muted" aria-label={listening ? "Stop dictation" : "Dictate your question"} aria-pressed={listening}>
            {listening ? <MicOff className="h-5 w-5 text-danger" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <textarea
          ref={textRef}
          name="text"
          rows={2}
          maxLength={4000}
          placeholder="Ask about a topic, or share how far you got with a question…"
          aria-label="Your question"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="min-h-11 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <SendButton />
      </div>
      <p className="text-xs text-muted-foreground">The tutor can make mistakes. Check important facts with your teacher. Your chats are private to you, except messages that raise a safety concern, which your school&apos;s safeguarding staff can see.</p>
    </form>
  );
}
