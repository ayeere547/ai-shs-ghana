import { MapPin, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { DemoBadge, EmptyState, Input, Select } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/env";
import { BOARDING, labelOf, OWNERSHIP, REGIONS } from "@/lib/ghana";
import { pageRange, searchTerm } from "@/lib/schools";
import { logoUrl } from "@/lib/school/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "School directory", description: "Find verified Senior High Schools on AI SHS Ghana by name, region, type and programme." };

type Entry = { slug: string; name: string; region: string; district: string; ownership: string; boarding_type: string; programmes_offered: string[]; logo_path: string | null; is_demo: boolean; total_count: number };

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; region?: string; ownership?: string; boarding?: string; programme?: string; page?: string }> }) {
  const params = await searchParams;
  const { page, from, size } = pageRange(params.page, 24);
  const region = REGIONS.some((r) => r.code === params.region) ? params.region : undefined;
  const ownership = OWNERSHIP.some((o) => o.value === params.ownership) ? params.ownership : undefined;
  const boarding = BOARDING.some((b) => b.value === params.boarding) ? params.boarding : undefined;

  let rows: Entry[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_school_directory", {
      p_query: searchTerm(params.q),
      p_region: region ?? null,
      p_ownership: ownership ?? null,
      p_boarding: boarding ?? null,
      p_programme: searchTerm(params.programme),
      p_limit: size,
      p_offset: from,
    });
    rows = (data ?? []) as Entry[];
  }
  const total = rows[0]?.total_count ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">School directory</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Verified schools that have chosen to be listed. Only information each school approved for public display is shown.</p>

      <form className="mt-8 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <Input name="q" defaultValue={params.q} placeholder="School or district…" aria-label="School name or district" className="lg:col-span-2" />
        <Select name="region" defaultValue={region ?? ""} aria-label="Region">
          <option value="">All regions</option>
          {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </Select>
        <Select name="ownership" defaultValue={ownership ?? ""} aria-label="Public or private">
          <option value="">Public & private</option>
          {OWNERSHIP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select name="boarding" defaultValue={boarding ?? ""} aria-label="Day or boarding">
          <option value="">Day & boarding</option>
          {BOARDING.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </Select>
        <Input name="programme" defaultValue={params.programme} placeholder="Programme…" aria-label="Programme" />
        <button type="submit" className={buttonClass("primary", "md", "sm:col-span-2 lg:col-span-6 lg:justify-self-end")}>Search</button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border bg-surface">
          <EmptyState icon={School} title="No listed schools match">Try a broader search. Schools appear here after verification if they opt in to the directory.</EmptyState>
        </div>
      ) : (
        <>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((s) => {
              const logo = logoUrl(s.logo_path);
              return (
                <li key={s.slug}>
                  <Link href={`/schools/${s.slug}`} className="flex h-full gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-royal/40">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logo ? <img src={logo} alt="" className="h-full w-full object-contain" loading="lazy" /> : <School className="h-5 w-5 text-muted-foreground" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden />{s.district}, {s.region}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{labelOf(OWNERSHIP, s.ownership)} · {labelOf(BOARDING, s.boarding_type)}</span>
                      {s.is_demo && <DemoBadge className="mt-2" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 rounded-lg border border-border bg-surface">
            <Pagination page={page} size={size} total={Number(total)} basePath="/schools" params={{ q: params.q, region, ownership, boarding, programme: params.programme }} />
          </div>
        </>
      )}
    </div>
  );
}
