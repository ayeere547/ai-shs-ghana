import { CheckCircle2, Clock } from "lucide-react";
import type { ReactNode } from "react";

import type { FeatureStatus } from "@/lib/site-content";
import { cn } from "@/lib/utils";

export function Section({ id, eyebrow, title, intro, children, className }: { id?: string; eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-16 sm:py-20", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-gold">{eyebrow}</p>}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          {intro && <p className="mt-3 text-muted-foreground">{intro}</p>}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export function StatusPill({ status, phase }: { status: FeatureStatus; phase?: number }) {
  return status === "available" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
      <CheckCircle2 className="h-3 w-3" aria-hidden /> Available
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Clock className="h-3 w-3" aria-hidden /> In development{phase ? ` · phase ${phase}` : ""}
    </span>
  );
}

export function FeatureCard({ title, body, status, phase }: { title: string; body: string; status: FeatureStatus; phase?: number }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-4">
        <StatusPill status={status} phase={phase} />
      </div>
    </div>
  );
}

export function Prose({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {updated && <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>}
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
    </article>
  );
}
