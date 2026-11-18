import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Safeguarding" };

async function markReviewed(formData: FormData) {
  "use server";
  await requireSchoolPermission("ai.safeguarding", { write: true });
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("review_flagged_message", { p_message: id.data });
  revalidatePath("/school/safeguarding");
}

type Flag = { id: string; content: string; flag_reason: string | null; created_at: string; reviewed_at: string | null; conversation_id: string; ai_tutor_conversations: { user_id: string } | null };

export default async function SafeguardingPage() {
  const { school } = await requireSchoolPermission("ai.safeguarding");
  const supabase = await createClient();
  const { data } = await supabase.from("ai_tutor_messages").select("id, content, flag_reason, created_at, reviewed_at, conversation_id, ai_tutor_conversations(user_id)").eq("school_id", school.schoolId).eq("flagged", true).order("created_at", { ascending: false }).limit(100).returns<Flag[]>();
  const userIds = [...new Set((data ?? []).map((f) => f.ai_tutor_conversations?.user_id).filter(Boolean) as string[])];
  const { data: students } = userIds.length ? await supabase.from("students").select("id, user_id, first_name, last_name").in("user_id", userIds) : { data: [] };
  const who = new Map((students ?? []).map((s) => [s.user_id, s]));

  return (
    <>
      <PageHeader title="Safeguarding" description="AI tutor messages that raised a possible safety concern. Only flagged messages are visible here — the rest of each student's tutor chat stays private." />
      <Alert tone="info" className="mb-4">The student was shown a caring reply pointing them to a trusted adult and the 112 emergency line. Follow your school&apos;s safeguarding procedure; marking a message reviewed is recorded in the audit log.</Alert>
      <Card>
        {!data?.length ? <EmptyState icon={ShieldCheck} title="No flagged messages" /> : (
          <ul className="divide-y divide-border">
            {data.map((f) => {
              const s = who.get(f.ai_tutor_conversations?.user_id ?? "");
              return (
                <li key={f.id} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{s ? <a href={`/school/students/${s.id}`} className="hover:text-royal hover:underline">{s.first_name} {s.last_name}</a> : "Student"} <span className="font-normal text-muted-foreground">· {formatDate(f.created_at, { dateStyle: "medium", timeStyle: "short" })}</span></p>
                    {f.reviewed_at ? <Badge tone="success">Reviewed {formatDate(f.reviewed_at)}</Badge> : <Badge tone="danger">Needs review</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap rounded-md bg-surface-muted p-3">{f.content}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Concern: {f.flag_reason ?? "unspecified"}</span>
                    {!f.reviewed_at && <form action={markReviewed}><input type="hidden" name="id" value={f.id} /><SubmitButton size="sm" variant="secondary">Mark reviewed</SubmitButton></form>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
