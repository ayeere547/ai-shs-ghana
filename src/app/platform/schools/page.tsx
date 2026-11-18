import { School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, DemoBadge, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requirePlatformPermission, type SchoolStatus } from "@/lib/auth/session";
import { BOARDING, labelOf, OWNERSHIP, REGIONS } from "@/lib/ghana";
import { pageRange, SCHOOL_STATUS, searchTerm } from "@/lib/schools";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Schools" };

type Row = { id: string; name: string; district: string; ownership: string; boarding_type: string; status: SchoolStatus; created_at: string; is_demo: boolean; regions: { name: string } | null };

export default async function PlatformSchools({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; region?: string; page?: string }> }) {
  await requirePlatformPermission("schools.read_all");
  const params = await searchParams;
  const { page, from, to, size } = pageRange(params.page);
  const q = searchTerm(params.q);
  const status = params.status && params.status in SCHOOL_STATUS ? params.status : undefined;
  const region = REGIONS.some((r) => r.code === params.region) ? params.region : undefined;

  const supabase = await createClient();
  let query = supabase.from("schools").select("id, name, district, ownership, boarding_type, status, created_at, is_demo, regions(name)", { count: "exact" });
  if (q) query = query.or(`name.ilike.%${q}%,district.ilike.%${q}%,school_code.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  if (region) query = query.eq("region_code", region);
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to).returns<Row[]>();

  return (
    <>
      <PageHeader title="Schools" description="Every registered school and its verification status." />
      <Card>
        <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search">
          <Input name="q" defaultValue={params.q} placeholder="Search name, district or code…" aria-label="Search schools" className="sm:max-w-xs" />
          <Select name="status" defaultValue={status ?? ""} aria-label="Filter by status" className="sm:w-52">
            <option value="">All statuses</option>
            {Object.entries(SCHOOL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select name="region" defaultValue={region ?? ""} aria-label="Filter by region" className="sm:w-48">
            <option value="">All regions</option>
            {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </Select>
          <button type="submit" className={buttonClass("secondary")}>Filter</button>
        </form>
        {!data?.length ? (
          <EmptyState icon={School} title="No schools match">Try a different search or filter.</EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>School</Th>
                  <Th className="hidden md:table-cell">Type</Th>
                  <Th>Status</Th>
                  <Th className="hidden sm:table-cell">Registered</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-muted/60">
                    <Td>
                      <Link href={`/platform/schools/${s.id}`} className="font-medium text-foreground hover:text-royal hover:underline">{s.name}</Link>
                      <p className="text-xs text-muted-foreground">{s.district}, {s.regions?.name}</p>
                      {s.is_demo && <DemoBadge className="mt-1" />}
                    </Td>
                    <Td className="hidden text-muted-foreground md:table-cell">{labelOf(OWNERSHIP, s.ownership)} · {labelOf(BOARDING, s.boarding_type)}</Td>
                    <Td><Badge tone={SCHOOL_STATUS[s.status].tone}>{SCHOOL_STATUS[s.status].label}</Badge></Td>
                    <Td className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDate(s.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} size={size} total={count ?? 0} basePath="/platform/schools" params={{ q: params.q, status, region }} />
          </>
        )}
      </Card>
    </>
  );
}
