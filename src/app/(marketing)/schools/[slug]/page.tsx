import { ArrowLeft, Globe, Mail, MapPin, Phone, School } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { DemoBadge } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/env";
import { BOARDING, labelOf, OWNERSHIP } from "@/lib/ghana";
import { logoUrl } from "@/lib/school/settings";
import { createClient } from "@/lib/supabase/server";

type Profile = { slug: string; name: string; region: string; district: string; ownership: string; boarding_type: string; programmes_offered: string[]; description: string | null; website: string | null; email: string; phone: string; logo_path: string | null; motto: string | null; primary_color: string | null; is_demo: boolean };

const load = cache(async (slug: string) => {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_school_profile", { p_slug: slug });
  return ((data ?? []) as Profile[])[0] ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await load((await params).slug);
  return s ? { title: s.name, description: s.description ?? `${s.name}, ${s.district}, ${s.region} Region` } : { title: "School not found" };
}

export default async function SchoolProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await load((await params).slug);
  if (!s) notFound();
  const logo = logoUrl(s.logo_path);
  return (
    <div>
      <div className="h-2" style={{ background: s.primary_color ?? "var(--primary)" }} aria-hidden />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <Link href="/schools" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Directory</Link>
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt={`${s.name} logo`} className="h-full w-full object-contain" /> : <School className="h-8 w-8 text-muted-foreground" aria-hidden />}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.name}</h1>
            {s.motto && <p className="mt-1 italic text-muted-foreground">“{s.motto}”</p>}
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden />{s.district}, {s.region} Region</p>
            {s.is_demo && <DemoBadge className="mt-2" />}
          </div>
        </div>
        {s.description && <p className="mt-8 leading-relaxed">{s.description}</p>}
        <dl className="mt-8 grid gap-4 rounded-lg border border-border bg-surface p-6 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt><dd className="mt-1">{labelOf(OWNERSHIP, s.ownership)} · {labelOf(BOARDING, s.boarding_type)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Programmes</dt><dd className="mt-1">{s.programmes_offered.join(", ") || "—"}</dd></div>
          <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" aria-hidden /><a href={`mailto:${s.email}`} className="text-royal hover:underline">{s.email}</a></div>
          <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" aria-hidden /><a href={`tel:${s.phone.replace(/[^+0-9]/g, "")}`} className="hover:underline">{s.phone}</a></div>
          {s.website && <div className="flex items-center gap-2 text-sm sm:col-span-2"><Globe className="h-4 w-4 text-muted-foreground" aria-hidden /><a href={s.website} target="_blank" rel="noopener noreferrer nofollow" className="text-royal hover:underline">{s.website}</a></div>}
        </dl>
        <p className="mt-6 text-xs text-muted-foreground">Information on this page is provided by the school. AI SHS Ghana verifies a school&apos;s identity before activation.</p>
      </div>
    </div>
  );
}
