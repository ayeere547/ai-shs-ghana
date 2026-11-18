import type { Metadata } from "next";

import { savePlan } from "@/app/platform/plans/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import type { PlanLimits } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plans" };

type Plan = { id: string; code: string; name: string; description: string | null; price_monthly_ghs: number | null; price_annual_ghs: number | null; limits: PlanLimits; features: string[]; is_public: boolean; is_active: boolean };

export default async function PlansPage() {
  await requirePlatformPermission("plans.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("subscription_plans").select("id, code, name, description, price_monthly_ghs, price_annual_ghs, limits, features, is_public, is_active").order("sort").returns<Plan[]>();
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));

  return (
    <>
      <PageHeader title="Plans" description="Prices (GH₵), limits and the features shown on the pricing page. Changes apply to new invoices; every change is audited." />
      <Alert tone="info" className="mb-6">A plan without a price shows &ldquo;Contact us&rdquo; and can only be assigned by platform staff. Blank limits mean unlimited. Schools that fall behind on payment get the Free plan&apos;s limits.</Alert>
      <div className="grid gap-6 xl:grid-cols-2">
        {(data ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.name} description={p.code} action={<Badge tone={!p.is_active ? "neutral" : p.is_public ? "success" : "warning"}>{!p.is_active ? "Retired" : p.is_public ? "Public" : "Hidden"}</Badge>} />
            <CardBody>
              <ActionForm action={savePlan} resetOnSuccess={false} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Name" htmlFor={`n-${p.code}`}><Input id={`n-${p.code}`} name="name" defaultValue={p.name} /></Field>
                <Field label="Visibility" htmlFor={`v-${p.code}`}>
                  <Select id={`v-${p.code}`} name="visibility" defaultValue={!p.is_active ? "retired" : p.is_public ? "public" : "hidden"} disabled={p.code === "free"}>
                    <option value="public">Public</option><option value="hidden">Hidden (staff-assigned only)</option><option value="retired">Retired</option>
                  </Select>
                  {p.code === "free" && <input type="hidden" name="visibility" value="public" />}
                </Field>
                <div className="sm:col-span-2"><Field label="Description" htmlFor={`d-${p.code}`}><Input id={`d-${p.code}`} name="description" defaultValue={p.description ?? ""} /></Field></div>
                <Field label="Monthly price (GH₵)" htmlFor={`m-${p.code}`}><Input id={`m-${p.code}`} name="monthly" inputMode="decimal" defaultValue={s(p.price_monthly_ghs)} disabled={p.code === "free"} /></Field>
                <Field label="Annual price (GH₵)" htmlFor={`a-${p.code}`}><Input id={`a-${p.code}`} name="annual" inputMode="decimal" defaultValue={s(p.price_annual_ghs)} disabled={p.code === "free"} /></Field>
                {p.code === "free" && <><input type="hidden" name="monthly" value="" /><input type="hidden" name="annual" value="" /></>}
                <Field label="Max active students" htmlFor={`st-${p.code}`}><Input id={`st-${p.code}`} name="maxStudents" inputMode="numeric" defaultValue={s(p.limits.max_students)} placeholder="Unlimited" /></Field>
                <Field label="Max staff records" htmlFor={`sf-${p.code}`}><Input id={`sf-${p.code}`} name="maxStaff" inputMode="numeric" defaultValue={s(p.limits.max_staff)} placeholder="Unlimited" /></Field>
                <Field label="AI requests / month" htmlFor={`ai-${p.code}`}><Input id={`ai-${p.code}`} name="aiRequests" inputMode="numeric" defaultValue={s(p.limits.ai_requests_per_month)} placeholder="Unlimited" /></Field>
                <div className="sm:col-span-2"><Field label="Features (one per line)" htmlFor={`f-${p.code}`}><Textarea id={`f-${p.code}`} name="features" rows={5} defaultValue={p.features.join("\n")} /></Field></div>
                <div><SubmitButton size="sm">Save {p.name}</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
