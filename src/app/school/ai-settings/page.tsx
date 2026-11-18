import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Card, CardBody, CardHeader, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { isAiConfigured } from "@/lib/ai/config";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI settings & usage" };

async function saveSettings(formData: FormData) {
  "use server";
  const { school } = await requireSchoolPermission("ai.settings", { write: true });
  const v = z.object({ daily: z.coerce.number().int().min(0).max(500) }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const supabase = await createClient();
  await supabase.from("ai_settings").update({ tutor_enabled: formData.get("tutor") === "on", teacher_tools_enabled: formData.get("teacher") === "on", student_daily_messages: v.data.daily }).eq("school_id", school.schoolId);
  await supabase.rpc("log_audit", { p_action: "ai.settings_updated", p_entity_type: "ai_settings", p_summary: "AI settings changed", p_school_id: school.schoolId });
  revalidatePath("/school/ai-settings");
}

const FEATURE: Record<string, string> = { tutor: "AI tutor", lesson_plan: "Lesson planner", notes: "Notes generator", questions: "Question generator", marking: "Marking assistant", report_comment: "Report comments", insights: "Insight summaries", embedding: "Knowledge indexing", moderation: "Safety checks" };

export default async function AiSettingsPage() {
  const { school } = await requireSchoolPermission("ai.settings");
  const supabase = await createClient();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: settings }, { data: quota }, { data: logs }] = await Promise.all([
    supabase.from("ai_settings").select("tutor_enabled, teacher_tools_enabled, student_daily_messages").eq("school_id", school.schoolId).single(),
    supabase.rpc("ai_quota", { p_school: school.schoolId }),
    supabase.from("ai_usage_logs").select("feature, status, input_tokens, output_tokens, cost_usd").eq("school_id", school.schoolId).gte("created_at", monthStart).limit(50000),
  ]);
  const q = quota as { limit: number | null; used: number } | null;
  const byFeature = new Map<string, { n: number; tokens: number; cost: number; blocked: number }>();
  for (const l of logs ?? []) {
    const f = byFeature.get(l.feature) ?? { n: 0, tokens: 0, cost: 0, blocked: 0 };
    if (l.status === "blocked") f.blocked++;
    else f.n++;
    f.tokens += l.input_tokens + l.output_tokens;
    f.cost += Number(l.cost_usd);
    byFeature.set(l.feature, f);
  }
  const writable = school.schoolStatus === "active";

  return (
    <>
      <PageHeader title="AI settings & usage" description="Control AI features for your school and see how much of this month's allowance has been used." />
      {!isAiConfigured() && <Alert tone="warning" className="mb-4">AI isn&apos;t configured on this server yet, so AI features are unavailable.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <Card className="self-start">
          <CardHeader title="Settings" />
          <CardBody>
            <form action={saveSettings} className="space-y-3 text-sm">
              <fieldset disabled={!writable} className="space-y-3">
                <label className="flex items-center gap-2"><input type="checkbox" name="tutor" defaultChecked={settings?.tutor_enabled} className="h-4 w-4 accent-[var(--royal)]" /> AI tutor for students</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="teacher" defaultChecked={settings?.teacher_tools_enabled} className="h-4 w-4 accent-[var(--royal)]" /> AI tools for teachers</label>
                <label className="block space-y-1"><span>Tutor messages per student per day</span><Input name="daily" type="number" min={0} max={500} defaultValue={settings?.student_daily_messages ?? 40} /></label>
              </fieldset>
              {writable && <SubmitButton size="sm">Save</SubmitButton>}
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="This month" description={q ? (q.limit === null ? `${q.used} requests · unlimited plan` : `${q.used} of ${q.limit} requests used`) : undefined} />
          {q && q.limit !== null && q.limit > 0 && (
            <div className="px-5 pt-4"><div className="h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-royal" style={{ width: `${Math.min(100, (q.used / q.limit) * 100)}%` }} /></div></div>
          )}
          {q?.limit === 0 && <div className="px-5 pt-4"><Alert tone="info">Your plan doesn&apos;t include AI requests yet. Contact AI SHS Ghana to enable them.</Alert></div>}
          <Table>
            <thead><tr><Th>Feature</Th><Th className="text-right">Requests</Th><Th className="text-right">Blocked</Th><Th className="text-right">Tokens</Th><Th className="text-right">Est. cost (USD)</Th></tr></thead>
            <tbody>
              {[...byFeature.entries()].map(([f, v]) => (
                <tr key={f}><Td>{FEATURE[f] ?? f}</Td><Td className="text-right tabular-nums">{v.n}</Td><Td className="text-right tabular-nums">{v.blocked}</Td><Td className="text-right tabular-nums">{v.tokens.toLocaleString()}</Td><Td className="text-right tabular-nums">{v.cost.toFixed(4)}</Td></tr>
              ))}
              {!byFeature.size && <tr><Td colSpan={5} className="text-muted-foreground">No AI usage this month.</Td></tr>}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
