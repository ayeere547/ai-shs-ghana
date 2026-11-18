import { CalendarCheck, Download, School, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";

import { HorizontalBars, SplitBar } from "@/components/dashboard/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/auth/session";
import type { NationalAnalytics } from "@/lib/analytics";
import { FUNDING_LABEL } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "National analytics" };

const ADOPTION: [keyof NationalAnalytics["adoption"], string][] = [
  ["attendance_30d", "Recording attendance (30 days)"],
  ["assignments_30d", "Setting assignments (30 days)"],
  ["online_exams_30d", "Running online exams (30 days)"],
  ["ai_30d", "Using AI tools (30 days)"],
  ["fee_invoices_90d", "Issuing fee invoices (90 days)"],
  ["parent_portal", "Parents using the portal"],
];

export default async function AnalyticsPage() {
  await requirePlatformPermission("analytics.national");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("national_analytics");
  const a = data as NationalAnalytics | null;
  const t = a?.totals;
  const active = a?.adoption.active_schools ?? 0;
  const dash = (v: number | null | undefined, suffix = "") => (v == null ? "—" : `${formatNumber(v)}${suffix}`);

  return (
    <>
      <PageHeader
        title="National analytics"
        description="Aggregated from schools using AI SHS Ghana. These are platform figures, not official Ministry, GES or national education statistics."
        actions={<a href="/platform/analytics/export" className={buttonClass("secondary", "sm")}><Download className="h-4 w-4" /> Regions CSV</a>}
      />
      {error && <Alert tone="danger" className="mb-6">Analytics could not be loaded.</Alert>}
      <Alert tone="info" className="mb-6">
        Only totals are shown — never individual students or schools. Figures for any group of fewer than {a?.min_group_size ?? 3} schools are hidden (&ldquo;—&rdquo;) so a single school can&apos;t be identified. Sample schools are excluded.
      </Alert>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active schools" value={t?.schools ?? 0} icon={School} tone="success" />
        <StatCard label="Active students" value={0} display={dash(t?.students)} detail={t?.female_students != null ? `${formatNumber(t.female_students)} female · ${formatNumber(t.male_students)} male` : undefined} icon={UserRound} />
        <StatCard label="Staff records" value={0} display={dash(t?.staff)} icon={Users} />
        <StatCard label="Attendance rate" value={0} display={dash(t?.attendance_rate_30d, "%")} detail="present or late, last 30 days" icon={CalendarCheck} />
      </div>

      <Card className="mt-6">
        <CardHeader title="By region" />
        <Table>
          <thead><tr><Th>Region</Th><Th className="text-right">Schools</Th><Th className="text-right">Students</Th><Th className="text-right">Staff</Th><Th className="text-right">Students per staff</Th><Th className="text-right">Attendance (30 days)</Th></tr></thead>
          <tbody>
            {(a?.by_region ?? []).map((r) => (
              <tr key={r.region}>
                <Td>{r.region}</Td>
                <Td className="text-right tabular-nums">{r.schools}</Td>
                <Td className="text-right tabular-nums">{dash(r.students)}</Td>
                <Td className="text-right tabular-nums">{dash(r.staff)}</Td>
                <Td className="text-right tabular-nums">{dash(r.students_per_staff)}</Td>
                <Td className="text-right tabular-nums">{dash(r.attendance_rate_30d, "%")}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Feature adoption" description={`Share of the ${active} active schools`} />
          <CardBody className="space-y-3">
            {active === 0 ? <EmptyState icon={School} title="No active schools yet" /> : ADOPTION.map(([k, label]) => (
              <div key={k}>
                <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums text-muted-foreground">{a!.adoption[k]} ({Math.round((a!.adoption[k] / active) * 100)}%)</span></div>
                <div className="mt-1 h-2 rounded-full bg-surface-muted"><div className="h-2 rounded-full bg-royal" style={{ width: `${Math.round((a!.adoption[k] / active) * 100)}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Schools verified per month" />
            <CardBody>
              {(a?.growth ?? []).some((g) => g.schools > 0) ? <HorizontalBars label="Schools verified" height={320} data={(a?.growth ?? []).map((g) => ({ name: g.month, value: g.schools }))} /> : <p className="text-sm text-muted-foreground">No schools verified in the last 12 months.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="How schools' plans are funded" />
            <CardBody>
              {(a?.plans ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions yet.</p> : (
                <SplitBar parts={Object.entries((a?.plans ?? []).reduce<Record<string, number>>((m, p) => ({ ...m, [p.funding_model]: (m[p.funding_model] ?? 0) + p.schools }), {}))
                  .map(([k, v], i) => ({ label: FUNDING_LABEL[k] ?? k, value: v, color: `var(--chart-${(i % 4) + 1})` }))} />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
