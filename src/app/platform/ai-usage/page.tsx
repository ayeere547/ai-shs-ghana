import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Card, CardHeader, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { isAiConfigured } from "@/lib/ai/config";
import { canPlatform, requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI usage" };

async function setLimit(formData: FormData) {
  "use server";
  await requirePlatformPermission("ai.limits.manage");
  const v = z.object({ schoolId: z.uuid(), limit: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const limit = v.data.limit === "" ? null : Number(v.data.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) return;
  const supabase = await createClient();
  await supabase.rpc("set_ai_limit", { p_school: v.data.schoolId, p_limit: limit });
  revalidatePath("/platform/ai-usage");
}

type Usage = { by_feature: { feature: string; requests: number; tokens: number; cost_usd: number }[]; by_school: { school_id: string; school: string; requests: number; cost_usd: number; limit_override: number | null }[]; blocked_this_month: number };

export default async function PlatformAiUsage() {
  const session = await requirePlatformPermission("analytics.national");
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_ai_usage");
  const u = data as Usage | null;
  const canSet = canPlatform(session, "ai.limits.manage");
  return (
    <>
      <PageHeader title="AI usage" description="This month's AI activity across schools. Costs are estimates from configured prices. No conversation content or student data is shown here." />
      {!isAiConfigured() && <Alert tone="warning" className="mb-4">OPENAI_API_KEY is not set, so AI features are unavailable on this deployment.</Alert>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="By feature" description={`${u?.blocked_this_month ?? 0} messages stopped by safety checks this month`} />
          <Table>
            <thead><tr><Th>Feature</Th><Th className="text-right">Requests</Th><Th className="text-right">Tokens</Th><Th className="text-right">USD</Th></tr></thead>
            <tbody>{(u?.by_feature ?? []).map((f) => <tr key={f.feature}><Td>{f.feature}</Td><Td className="text-right tabular-nums">{f.requests}</Td><Td className="text-right tabular-nums">{Number(f.tokens ?? 0).toLocaleString()}</Td><Td className="text-right tabular-nums">{Number(f.cost_usd).toFixed(4)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="By school" description="Set a monthly request allowance to override the school's plan (blank = use the plan)." />
          <Table>
            <thead><tr><Th>School</Th><Th className="text-right">Requests</Th><Th className="text-right">USD</Th>{canSet && <Th>Allowance</Th>}</tr></thead>
            <tbody>
              {(u?.by_school ?? []).map((s) => (
                <tr key={s.school_id}>
                  <Td>{s.school}</Td>
                  <Td className="text-right tabular-nums">{s.requests}</Td>
                  <Td className="text-right tabular-nums">{Number(s.cost_usd).toFixed(4)}</Td>
                  {canSet && <Td><form action={setLimit} className="flex gap-2"><input type="hidden" name="schoolId" value={s.school_id} /><Input name="limit" defaultValue={s.limit_override ?? ""} placeholder="Plan" aria-label={`Allowance for ${s.school}`} className="h-8 w-24" /><SubmitButton size="sm" variant="secondary">Set</SubmitButton></form></Td>}
                </tr>
              ))}
              {!u?.by_school.length && <tr><Td colSpan={4} className="text-muted-foreground">No usage this month. Schools with no usage can be given an allowance from their school page.</Td></tr>}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
