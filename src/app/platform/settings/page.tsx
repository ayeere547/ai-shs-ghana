import { CheckCircle2, CircleDashed } from "lucide-react";
import type { Metadata } from "next";

import { saveSettings } from "@/app/platform/settings/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import { integrationStatus } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform settings" };

export default async function SettingsPage() {
  await requirePlatformPermission("platform.settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value");
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  const registrationOpen = String(get("registration_open") ?? "true") === "true";
  const maxPending = Number(get("max_pending_registrations_per_user") ?? 3);

  return (
    <>
      <PageHeader title="Platform settings" description="Registration rules and the status of connected services. Changes are recorded in the audit log." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="School registration" />
          <CardBody>
            <ActionForm action={saveSettings} resetOnSuccess={false} className="space-y-4">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="registrationOpen" defaultChecked={registrationOpen} className="mt-0.5 h-4 w-4 accent-[var(--royal)]" />
                <span><span className="font-medium">Accept new school registrations</span><span className="block text-muted-foreground">When off, the registration form tells schools to try again later.</span></span>
              </label>
              <Field label="Pending registrations allowed per person" htmlFor="maxPending">
                <Input id="maxPending" name="maxPending" type="number" min={1} max={20} defaultValue={maxPending} className="w-28" />
              </Field>
              <SubmitButton size="sm">Save</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Integrations" description="Configured through server environment variables. Values are never shown here." />
          <ul className="divide-y divide-border">
            {integrationStatus().map((i) => (
              <li key={i.key} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex gap-2">
                  {i.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" aria-hidden /> : <CircleDashed className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />}
                  <div><p className="font-medium">{i.name}</p><p className="font-mono text-xs text-muted-foreground">{i.envVars.join(", ")}</p></div>
                </div>
                <Badge tone={i.configured ? "success" : i.required ? "danger" : "neutral"}>{i.configured ? "Configured" : "Not set"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
