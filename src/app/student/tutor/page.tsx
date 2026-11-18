import { BookMarked, MessageSquarePlus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { TutorComposer } from "@/components/tutor/chat";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { aiAccess } from "@/lib/ai/service";
import { classSubjects, requireStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

import { deleteConversation, newConversation } from "./actions";

export const metadata: Metadata = { title: "AI tutor" };

type Msg = { id: string; role: string; content: string; citations: { n: number; title: string; heading: string | null; official: boolean }[]; created_at: string };

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { student, school } = await requireStudent();
  const { c } = await searchParams;
  const supabase = await createClient();
  const [access, { data: conversations }, subjects] = await Promise.all([
    aiAccess(school.schoolId, "tutor"),
    supabase.from("ai_tutor_conversations").select("id, title, last_message_at, school_subjects(name)").order("last_message_at", { ascending: false }).limit(50).returns<{ id: string; title: string; last_message_at: string; school_subjects: { name: string } | null }[]>(),
    student?.class_id ? classSubjects(student.class_id) : Promise.resolve([]),
  ]);
  const current = conversations?.find((x) => x.id === c);
  const { data: messages } = current
    ? await supabase.from("ai_tutor_messages").select("id, role, content, citations, created_at").eq("conversation_id", current.id).order("created_at").returns<Msg[]>()
    : { data: [] as Msg[] };

  return (
    <>
      <PageHeader title="AI tutor" description="A study partner that explains step by step, asks you questions back, and cites your school's materials." />
      {!access.ok && <Alert tone="warning" className="mb-4">{access.reason}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="space-y-3">
          <Card>
            <CardBody>
              <form action={newConversation} className="space-y-2">
                <Select name="subjectId" defaultValue="" aria-label="Subject">
                  <option value="">Any subject</option>
                  {subjects.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
                <SubmitButton size="sm" className="w-full"><MessageSquarePlus className="h-4 w-4" /> New conversation</SubmitButton>
              </form>
            </CardBody>
          </Card>
          <nav aria-label="Conversations" className="space-y-1">
            {(conversations ?? []).map((x) => (
              <Link key={x.id} href={`/student/tutor?c=${x.id}`} aria-current={x.id === current?.id ? "page" : undefined} className={cn("block rounded-md px-3 py-2 text-sm", x.id === current?.id ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-surface")}>
                <span className="line-clamp-1">{x.title}</span>
                <span className="block text-xs text-muted-foreground">{x.school_subjects?.name ?? "Any subject"} · {formatDate(x.last_message_at, { dateStyle: "medium" })}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <Card className="flex min-h-[28rem] flex-col">
          {!current ? (
            <EmptyState icon={Sparkles} title="Start a conversation">Pick a subject and start a new conversation. You can type, dictate, or attach a photo of a question.</EmptyState>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <p className="truncate text-sm font-semibold">{current.title}</p>
                <form action={deleteConversation}><input type="hidden" name="id" value={current.id} /><ConfirmSubmit title="Delete conversation?" description="This removes the conversation from your history." confirmLabel="Delete">Delete</ConfirmSubmit></form>
              </div>
              <ol className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
                {!messages?.length && <li className="text-sm text-muted-foreground">Ask your first question. Tip: tell the tutor what you&apos;ve already tried.</li>}
                {messages?.map((m) => (
                  <li key={m.id} className={cn("max-w-[85%] rounded-lg px-4 py-3 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-surface-muted")}>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    {m.role === "assistant" && m.citations.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        {m.citations.map((s) => (
                          <li key={s.n} className="flex items-center gap-1.5"><BookMarked className="h-3.5 w-3.5" /> [{s.n}] {s.title}{s.heading ? ` — ${s.heading}` : ""}{s.official && <Badge tone="success" className="ml-1">Official</Badge>}</li>
                        ))}
                      </ul>
                    )}
                    {m.role === "assistant" && m.citations.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">AI explanation — not from your school&apos;s materials.</p>}
                  </li>
                ))}
              </ol>
              <div className="border-t border-border p-4">{access.ok ? <TutorComposer key={current.id} conversationId={current.id} /> : <p className="text-sm text-muted-foreground">{access.reason}</p>}</div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
