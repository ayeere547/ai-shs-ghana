import { Wrench } from "lucide-react";
import type { Metadata } from "next";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { reportFault, updateFault } from "../operations/actions";

export const metadata: Metadata = { title: "Maintenance" };

const STATUS: Record<string, { label: string; tone: "danger" | "warning" | "success" | "neutral" }> = {
  open: { label: "Open", tone: "danger" },
  in_progress: { label: "In progress", tone: "warning" },
  done: { label: "Done", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

type Req = { id: string; location: string; description: string; priority: string; status: string; assigned_to: string | null; created_at: string; school_assets: { tag: string; name: string } | null };

export default async function MaintenancePage() {
  const { school } = await requireSchoolPermission("school.dashboard");
  const manage = school.permissions.has("inventory.manage") && school.schoolStatus === "active";
  const supabase = await createClient();
  // RLS: managers see every report; other staff see the ones they reported.
  const { data } = await supabase.from("maintenance_requests").select("id, location, description, priority, status, assigned_to, created_at, school_assets(tag, name)").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(100).returns<Req[]>();
  return (
    <>
      <PageHeader title="Maintenance" description={manage ? "Every reported fault. Update progress as work is done." : "Report broken equipment or facilities. You'll see the progress of your reports here."} />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          {!data?.length ? <EmptyState icon={Wrench} title="No reports" /> : (
            <ul className="divide-y divide-border">
              {data.map((r) => (
                <li key={r.id} className="space-y-2 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{r.location}{r.school_assets ? ` · ${r.school_assets.tag} ${r.school_assets.name}` : ""}</p>
                    <span className="flex gap-1">{r.priority === "urgent" && <Badge tone="danger">Urgent</Badge>}<Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></span>
                  </div>
                  <p className="text-muted-foreground">{r.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}{r.assigned_to ? ` · assigned to ${r.assigned_to}` : ""}</p>
                  {manage && (
                    <form action={updateFault} className="flex flex-col gap-2 sm:flex-row">
                      <input type="hidden" name="id" value={r.id} />
                      <Select name="status" defaultValue={r.status} aria-label="Status" className="h-8 sm:w-36">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
                      <Input name="assignedTo" defaultValue={r.assigned_to ?? ""} placeholder="Assigned to" aria-label="Assigned to" className="h-8" />
                      <SubmitButton size="sm" variant="secondary">Update</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {school.schoolStatus === "active" && (
          <Card className="self-start">
            <CardHeader title="Report a problem" />
            <CardBody>
              <ActionForm action={reportFault}>
                <Field label="Where" htmlFor="mf-loc"><Input id="mf-loc" name="location" placeholder="e.g. Science lab 2" /></Field>
                <Field label="What's wrong" htmlFor="mf-desc"><Textarea id="mf-desc" name="description" maxLength={1000} /></Field>
                <Field label="Priority" htmlFor="mf-pri"><Select id="mf-pri" name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="urgent">Urgent (safety risk)</option></Select></Field>
                <SubmitButton>Report</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
