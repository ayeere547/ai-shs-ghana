"use client";

import { Clock, CloudOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { saveAnswer, submitExam } from "@/app/student/actions";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type PaperQuestion = { id: string; type: "mcq" | "true_false" | "short_answer" | "essay"; prompt: string; marks: number; options: { id: string; text: string }[] | null; source: string; response: Record<string, unknown> | null };

type SaveState = "idle" | "saving" | "saved" | "offline";

/**
 * Timed exam. Every answer is autosaved to the server (debounced for typing) and retried when the
 * connection returns. The countdown uses the server's clock; when it reaches zero the paper is submitted.
 */
export function ExamTaker({ attemptId, examId, deadline, serverNow, questions }: { attemptId: string; examId: string; deadline: string; serverNow: string; questions: PaperQuestion[] }) {
  const offset = useRef(Date.parse(serverNow) - Date.now());
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(questions.filter((q) => q.response).map((q) => [q.id, q.response!])));
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const [remaining, setRemaining] = useState(() => Date.parse(deadline) - (Date.now() + offset.current));
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Map<string, Record<string, unknown>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  const flush = useCallback(async (qid: string) => {
    const value = pending.current.get(qid);
    if (!value) return;
    setStatus((s) => ({ ...s, [qid]: "saving" }));
    try {
      const res = await saveAnswer(attemptId, qid, value);
      if (res.ok) {
        if (pending.current.get(qid) === value) pending.current.delete(qid);
        setStatus((s) => ({ ...s, [qid]: "saved" }));
      } else {
        setError(res.error ?? "Couldn't save your answer.");
        if (res.closed) window.location.replace(`/student/exams/${examId}?submitted=1`);
        setStatus((s) => ({ ...s, [qid]: "offline" }));
      }
    } catch {
      setStatus((s) => ({ ...s, [qid]: "offline" })); // network error — retried on reconnect / next change
    }
  }, [attemptId, examId]);

  const answer = (qid: string, value: Record<string, unknown>, debounce = 0) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
    pending.current.set(qid, value);
    clearTimeout(timers.current.get(qid));
    timers.current.set(qid, setTimeout(() => void flush(qid), debounce));
  };

  // Countdown, auto-submit at zero, retry unsaved answers when back online.
  useEffect(() => {
    const tick = setInterval(() => {
      const left = Date.parse(deadline) - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 0 && !submitted.current) {
        submitted.current = true;
        Promise.all([...pending.current.keys()].map(flush)).finally(() => formRef.current?.requestSubmit());
      }
    }, 1000);
    const online = () => [...pending.current.keys()].forEach((q) => void flush(q));
    window.addEventListener("online", online);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", online);
    };
  }, [deadline, flush]);

  const mins = Math.max(0, Math.floor(remaining / 60000));
  const secs = Math.max(0, Math.floor((remaining % 60000) / 1000));
  const answered = questions.filter((q) => answers[q.id]).length;
  const offline = Object.values(status).includes("offline");

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className={cn("inline-flex items-center gap-2 font-semibold tabular-nums", remaining < 5 * 60000 && "text-danger")} role="timer" aria-live="off">
          <Clock className="h-4 w-4" /> {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")} left
        </span>
        <span className="text-sm text-muted-foreground">{answered} of {questions.length} answered</span>
        {offline && <span className="inline-flex items-center gap-1 text-xs text-warning"><CloudOff className="h-4 w-4" /> Some answers not saved yet — they will retry</span>}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">Question {i + 1} <span className="font-normal text-muted-foreground">· {q.marks} mark{q.marks === 1 ? "" : "s"}</span></p>
              <span className="flex items-center gap-2">
                {q.source === "licensed_past_question" && <Badge tone="success">Licensed past question</Badge>}
                {q.source === "ai_generated" && <Badge tone="warning">AI-generated practice</Badge>}
                {status[q.id] === "saving" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" />}
                {status[q.id] === "saved" && <span className="text-xs text-accent">Saved</span>}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{q.prompt}</p>
            <div className="mt-3">
              {q.type === "mcq" && (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Options</legend>
                  {q.options?.map((o) => (
                    <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm", answers[q.id]?.choice === o.id ? "border-royal bg-royal-soft" : "border-border hover:bg-surface-muted")}>
                      <input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.choice === o.id} onChange={() => answer(q.id, { choice: o.id })} className="mt-0.5 h-4 w-4 accent-[var(--royal)]" />
                      <span><span className="mr-1 font-medium uppercase">{o.id}.</span>{o.text}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {q.type === "true_false" && (
                <div className="flex gap-2">
                  {[true, false].map((b) => (
                    <button key={String(b)} type="button" onClick={() => answer(q.id, { value: b })} aria-pressed={answers[q.id]?.value === b} className={cn("h-11 flex-1 rounded-md border text-sm font-medium", answers[q.id]?.value === b ? "border-royal bg-royal-soft text-royal" : "border-border hover:bg-surface-muted")}>
                      {b ? "True" : "False"}
                    </button>
                  ))}
                </div>
              )}
              {(q.type === "short_answer" || q.type === "essay") && (
                <textarea
                  defaultValue={String(answers[q.id]?.text ?? "")}
                  onChange={(e) => answer(q.id, { text: e.target.value }, 1200)}
                  onBlur={() => void flush(q.id)}
                  rows={q.type === "essay" ? 8 : 2}
                  maxLength={10000}
                  aria-label={`Answer to question ${i + 1}`}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      <form
        ref={formRef}
        action={async (fd) => {
          await Promise.all([...pending.current.keys()].map(flush));
          await submitExam(fd);
        }}
        onSubmit={(e) => {
          if (!submitted.current && answered < questions.length && !window.confirm(`You have answered ${answered} of ${questions.length} questions. Submit anyway?`)) e.preventDefault();
        }}
        className="flex justify-end"
      >
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="examId" value={examId} />
        <Button type="submit" size="lg">Submit exam</Button>
      </form>
    </div>
  );
}
