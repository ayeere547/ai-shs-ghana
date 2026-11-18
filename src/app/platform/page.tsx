import { Building2, Clock, GraduationCap, School, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HorizontalBars, SplitBar } from "@/components/dashboard/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { canPlatform, requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "National overview" };

type Overview = {
  schools_by_status: Record<string, number>;
  active_by_ownership: Record<string, number>;
  active_by_boarding: Record<string, number>;
  active_by_region: { region: string; count: number }[];
  members_by_group: Record<string, number>;
  registrations_last_30_days: number;
  demo_schools: number;
};

export default async function PlatformOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requirePlatformPermission("platform.dashboard");
  const { denied } = await searchParams;
  const supabase = await createClient();
  const [{ data, error }, pending] = await Promise.all([
    supabase.rpc("platform_overview"),
    canPlatform(session, "schools.read_all")
      ? supabase.from("schools").select("id, name, district, created_at, regions(name)").eq("status", "pending_verification").order("created_at").limit(6)
      : Promise.resolve({ data: null }),
  ]);
  const o = data as Overview | null;
  const s = o?.schools_by_status ?? {};
  const m = o?.members_by_group ?? {};

  return (
    <>
      <PageHeader
        title="National overview"
        description="Platform activity across all registered schools. Figures are platform records only — they are not official national education statistics."
      />
      {denied && <Alert tone="warning" className="mb-6">You don&apos;t have access to that page.</Alert>}
      {error && <Alert tone="danger" className="mb-6">The overview could not be loaded.</Alert>}
      {(o?.demo_schools ?? 0) > 0 && (
        <Alert tone="info" className="mb-6">
          {o!.demo_schools} sample schools from development seed data exist and are excluded from these figures.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active schools" value={s.active ?? 0} icon={School} tone="success" href="/platform/schools?status=active" />
        <StatCard label="Awaiting verification" value={s.pending_verification ?? 0} icon={Clock} tone="warning" href="/platform/schools?status=pending_verification" />
        <StatCard label="Suspended" value={s.suspended ?? 0} icon={Building2} href="/platform/schools?status=suspended" />
        <StatCard label="Teachers" value={m.teachers ?? 0} icon={GraduationCap} detail="active memberships" />
        <StatCard label="Students" value={m.students ?? 0} icon={UserRound} detail="active memberships" />
        <StatCard label="Other staff" value={m.other_staff ?? 0} icon={Users} detail={`${o?.registrations_last_30_days ?? 0} registrations in 30 days`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Active schools by region" description="Verified, active schools on the platform" />
          <CardBody>
            {(o?.active_by_region ?? []).some((r) => r.count > 0) ? (
              <HorizontalBars label="Active schools" data={(o?.active_by_region ?? []).map((r) => ({ name: r.region, value: r.count }))} />
            ) : (
              <EmptyState icon={School} title="No active schools yet">Approved schools will appear here by region.</EmptyState>
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Public vs private" description="Active schools" />
            <CardBody>
              <SplitBar
                parts={[
                  { label: "Public", value: o?.active_by_ownership.public ?? 0, color: "var(--chart-1)" },
                  { label: "Private", value: o?.active_by_ownership.private ?? 0, color: "var(--chart-2)" },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Day and boarding" description="Active schools" />
            <CardBody>
              <SplitBar
                parts={[
                  { label: "Day", value: o?.active_by_boarding.day ?? 0, color: "var(--chart-1)" },
                  { label: "Boarding", value: o?.active_by_boarding.boarding ?? 0, color: "var(--chart-2)" },
                  { label: "Day and boarding", value: o?.active_by_boarding.day_and_boarding ?? 0, color: "var(--chart-3)" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      {pending.data && (
        <Card className="mt-6">
          <CardHeader title="Verification queue" description="Oldest registrations first" action={<Link href="/platform/schools?status=pending_verification" className="text-sm font-medium text-royal hover:underline">View all</Link>} />
          {pending.data.length === 0 ? (
            <EmptyState icon={Clock} title="Nothing waiting">New school registrations will appear here for review.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {(pending.data as unknown as { id: string; name: string; district: string; created_at: string; regions: { name: string } | null }[]).map((p) => (
                <li key={p.id}>
                  <Link href={`/platform/schools/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.district}, {p.regions?.name}</span>
                    </span>
                    <Badge tone="warning">{formatDate(p.created_at)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
