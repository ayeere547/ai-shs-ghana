import type { Metadata } from "next";
import Link from "next/link";

import { FeatureCard, Section } from "@/components/marketing/blocks";
import { buttonClass } from "@/components/ui/button";
import { FEATURE_GROUPS } from "@/lib/site-content";

export const metadata: Metadata = { title: "Features", description: "School management, AI learning, WASSCE preparation and parent communication for Ghanaian SHSs." };

export default function FeaturesPage() {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Features</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            AI SHS Ghana is being built in phases. Each feature below is labelled <strong>Available</strong> or <strong>In development</strong> so you
            always know what you can use today.
          </p>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Feature areas">
            {FEATURE_GROUPS.map((g) => (
              <a key={g.id} href={`#${g.id}`} className={buttonClass("secondary", "sm")}>{g.title}</a>
            ))}
          </nav>
        </div>
      </div>
      {FEATURE_GROUPS.map((g, i) => (
        <Section key={g.id} id={g.id} title={g.title} intro={g.intro} className={i % 2 ? "bg-surface-muted/50" : undefined}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.features.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </Section>
      ))}
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Link href="/register" className={buttonClass("primary", "lg")}>Register your school</Link>
      </div>
    </>
  );
}
