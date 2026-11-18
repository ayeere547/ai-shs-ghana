import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusPill } from "@/components/marketing/blocks";
import { buttonClass } from "@/components/ui/button";
import { AUDIENCES, type Audience } from "@/lib/site-content";

const isAudience = (v: string): v is Audience => v in AUDIENCES;

export async function generateMetadata({ params }: { params: Promise<{ audience: string }> }): Promise<Metadata> {
  const { audience } = await params;
  return isAudience(audience) ? { title: AUDIENCES[audience].title, description: AUDIENCES[audience].intro } : {};
}

export default async function AudiencePage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  if (!isAudience(audience)) notFound();
  const a = AUDIENCES[audience];
  return (
    <>
      <section className="bg-charcoal text-charcoal-foreground">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">{a.title}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{a.headline}</h1>
          <p className="mt-4 max-w-2xl text-white/70">{a.intro}</p>
          <Link href={a.cta.href} className={buttonClass("primary", "lg", "mt-8 bg-gold text-[#1a1405] hover:bg-gold/90")}>{a.cta.label}</Link>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {a.points.map((p) => (
            <div key={p.title} className="rounded-lg border border-border bg-surface p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{p.title}</h2>
                <StatusPill status={p.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
