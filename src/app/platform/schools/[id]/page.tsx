import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, Badge, Card, CardBody, CardHeader, DemoBadge, PageHeader } from "@/components/ui/primitives";
import { canPlatform, requirePlatformPermission, type SchoolStatus } from "@/lib/auth/session";
import { schoolRoleLabel } from "@/lib/auth/permissions";
import { BOARDING, CATEGORIES, labelOf, OWNERSHIP } from "@/lib/ghana";
import { SCHOOL_STATUS } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { DecisionPanel } from "./decision-panel";

export const metadata: Metadata = { title: "School" };

type School = {
  id: string; name: string; slug: string; school_code: string | null; category: string; ownership: string; boarding_type: string; district: string; address: string;
  email: string; phone: string; website: string | null; programmes_offered: string[]; headmaster_name: string; headmaster_email: string | null; headmaster_phone: string | null;
  description: string | null; public_listing: boolean; status: SchoolStatus; status_reason: string | null; verified_at: string | null; created_at: string; is_demo: boolean;
  onboarding_completed_at: string | null; registered_by: string | null; regions: { name: string } | null;
};

export default async function PlatformSchool({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformPermission("schools.read_all");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: s } = await supabase.from("schools").select("*, regions(name)").eq("id", id).maybeSingle<School>();
  if (!s) notFound();

  const [{ data: registrant }, { data: members }, { data: audit }] = await Promise.all([
    s.registered_by ? supabase.from("profiles").select("full_name, email").eq("id", s.registered_by).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("school_memberships").select("roles(key)").eq("school_id", id).eq("status", "active").returns<{ roles: { key: string } | null }[]>(),
    canPlatform(session, "platform.audit.read")
      ? supabase.from("audit_logs").select("id, created_at, action, summary").eq("school_id", id).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: null }),
  ]);

  const roleCounts = new Map<string, number>();
  for (const m of members ?? []) if (m.roles) roleCounts.set(m.roles.key, (roleCounts.get(m.roles.key) ?? 0) + 1);

  const decisions = [
    ...(s.status === "pending_verification" && canPlatform(session, "schools.verify") ? (["approve", "reject"] as const) : []),
    ...(s.status === "active" && canPlatform(session, "schools.suspend") ? (["suspend"] as const) : []),
    ...(s.status === "suspended" && canPlatform(session, "schools.suspend") ? (["reactivate"] as const) : []),
  ];

  const rows: [string, React.ReactNode][] = [
    ["School code", s.school_code ?? "—"],
    ["Category", labelOf(CATEGORIES, s.category)],
    ["Type", `${labelOf(OWNERSHIP, s.ownership)} · ${labelOf(BOARDING, s.boarding_type)}`],
    ["Region / district", `${s.regions?.name ?? "—"} · ${s.district}`],
    ["Address", s.address],
    ["Email", s.email],
    ["Telephone", s.phone],
    ["Website", s.website ? <a key="w" href={s.website} target="_blank" rel="noopener noreferrer nofollow" className="text-royal hover:underline">{s.website}</a> : "—"],
    ["Headteacher", [s.headmaster_name, s.headmaster_email, s.headmaster_phone].filter(Boolean).join(" · ")],
    ["Programmes", s.programmes_offered.join(", ") || "—"],
    ["Registered by", registrant ? `${registrant.full_name ?? "—"} (${registrant.email})` : "—"],
    ["Registered", formatDate(s.created_at, { dateStyle: "medium", timeStyle: "short" })],
    ["Verified", s.verified_at ? formatDate(s.verified_at, { dateStyle: "medium", timeStyle: "short" }) : "—"],
    ["Public directory", s.public_listing ? "Listed" : "Not listed"],
  ];

  return (
    <>
      <Link href="/platform/schools" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All schools
      </Link>
      <PageHeader
        title={s.name}
        description={s.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            {s.is_demo && <DemoBadge />}
            <Badge tone={SCHOOL_STATUS[s.status].tone}>{SCHOOL_STATUS[s.status].label}</Badge>
          </div>
        }
      />
      {s.status_reason && (
        <Alert tone={s.status === "active" ? "info" : "warning"} className="mb-6" title="Status note">{s.status_reason}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Registration details" description="Check these against official records before approving." />
          <dl className="divide-y divide-border">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="sm:col-span-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6">
          {decisions.length > 0 && (
            <Card>
              <CardHeader title="Decision" description="Recorded in the audit log and sent to the school." />
              <CardBody>
                <DecisionPanel schoolId={s.id} decisions={[...decisions]} />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Members" description="Counts only — school records stay private to the school." />
            <CardBody>
              {roleCounts.size === 0 ? (
                <p className="text-sm text-muted-foreground">No active members.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {[...roleCounts].map(([k, n]) => (
                    <li key={k} className="flex justify-between"><span className="text-muted-foreground">{schoolRoleLabel(k)}</span><span className="font-medium tabular-nums">{n}</span></li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Onboarding: {s.onboarding_completed_at ? `completed ${formatDate(s.onboarding_completed_at)}` : "in progress"}</p>
            </CardBody>
          </Card>
          {audit && (
            <Card>
              <CardHeader title="Recent activity" />
              <ul className="divide-y divide-border">
                {audit.length === 0 && <li className="px-5 py-3 text-sm text-muted-foreground">No activity recorded.</li>}
                {audit.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p className="font-mono text-xs text-muted-foreground">{a.action}</p>
                    <p>{a.summary}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(a.created_at, { dateStyle: "medium", timeStyle: "short" })}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
