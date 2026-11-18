import { ArrowRight, BookOpenCheck, Building2, GraduationCap, Lock, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";

import { FeatureCard, Section } from "@/components/marketing/blocks";
import { buttonClass } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { CORE_SUBJECTS, ELECTIVE_SUBJECTS, FEATURE_GROUPS } from "@/lib/site-content";
import { createClient } from "@/lib/supabase/server";


async function platformStats() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_platform_stats");
  return data as { active_schools: number; regions_covered: number } | null;
}

const AUDIENCE_CARDS = [
  { href: "/for/schools", icon: Building2, title: "School leaders", body: "Structure, staff, records and oversight with a full audit trail." },
  { href: "/for/teachers", icon: GraduationCap, title: "Teachers", body: "AI help with planning, questions and marking — always under your review." },
  { href: "/for/students", icon: Sparkles, title: "Students", body: "A tutor that explains step by step, plus WASSCE practice." },
  { href: "/for/parents", icon: Users, title: "Parents", body: "Verified access to your own child's progress and school news." },
];

export default async function HomePage() {
  const stats = await platformStats();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-charcoal text-charcoal-foreground">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-royal/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-48 left-0 h-80 w-80 rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden /> Built for Ghanaian Senior High Schools
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Smarter schools.
              <br />
              <span className="text-gold">Stronger learners.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              AI SHS Ghana brings school management, AI-supported teaching and learning, WASSCE preparation and parent communication into one secure
              platform — with every school&apos;s records kept strictly its own.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass("primary", "lg", "bg-gold text-[#1a1405] hover:bg-gold/90")}>
                Register your school <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/features" className={buttonClass("ghost", "lg", "text-white hover:bg-white/10")}>Explore features</Link>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-sm font-semibold text-white">How a school joins</p>
            <ol className="mt-4 space-y-4">
              {[
                ["Register", "Submit your school's official details."],
                ["Verification", "Our team confirms the school before activation."],
                ["Guided setup", "Branding, calendar, programmes, classes and staff."],
                ["Launch", "Staff sign in to a workspace configured for your school."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-gold">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-medium text-white">{t}</span>
                    <span className="block text-sm text-white/60">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <Section eyebrow="One platform" title="Built for everyone in the school community" intro="Each person gets a workspace shaped by their role — and sees only what that role allows.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE_CARDS.map((a) => (
            <Link key={a.href} href={a.href} className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-royal/40">
              <span className="inline-flex rounded-md bg-royal-soft p-2 text-royal"><a.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-royal">Learn more <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Features preview */}
      {FEATURE_GROUPS.slice(0, 2).map((g, i) => (
        <Section key={g.id} id={g.id} eyebrow={g.title} title={i === 0 ? "Everything a school runs on" : "AI that teaches, not just answers"} intro={g.intro} className={i === 0 ? "bg-surface-muted/50" : undefined}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.features.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
          {g.id === "ai" && (
            <div className="mt-8 rounded-lg border border-border bg-surface p-5">
              <p className="text-sm font-semibold">Planned subject coverage</p>
              <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Core:</span> {CORE_SUBJECTS.join(", ")}.</p>
              <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">Electives:</span> {ELECTIVE_SUBJECTS.join(", ")}, and other subjects configured by schools.</p>
            </div>
          )}
        </Section>
      ))}

      {/* Trust */}
      <Section eyebrow="Trust" title="Children's data deserves serious protection" className="bg-surface-muted/50">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Lock, title: "Isolated by design", body: "Each school is a separate tenant enforced by database row-level security, so one school can never read another's records." },
            { icon: ShieldCheck, title: "Least-privilege roles", body: "Teachers, students, parents and administrators each see only what their role permits. Health records stay with authorised staff." },
            { icon: BookOpenCheck, title: "Accountable and lawful", body: "Administrative actions are audit-logged. We follow the principles of Ghana's Data Protection Act, 2012 (Act 843)." },
          ].map((t) => (
            <div key={t.title} className="rounded-lg border border-border bg-surface p-5">
              <t.icon className="h-5 w-5 text-royal" aria-hidden />
              <h3 className="mt-3 font-semibold">{t.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Verified stats only */}
      {stats && stats.active_schools > 0 && (
        <Section title="On the platform today" intro="Live figures from verified schools on AI SHS Ghana.">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-6">
              <dt className="text-sm text-muted-foreground">Verified schools</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">{stats.active_schools}</dd>
            </div>
            <div className="rounded-lg border border-border bg-surface p-6">
              <dt className="text-sm text-muted-foreground">Regions represented</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">{stats.regions_covered} <span className="text-base font-normal text-muted-foreground">of 16</span></dd>
            </div>
          </dl>
        </Section>
      )}

      {/* CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Bring your school onto AI SHS Ghana</h2>
            <p className="mt-2 text-white/75">Registration is free. Platform staff verify every school before it is activated.</p>
          </div>
          <Link href="/register" className={buttonClass("primary", "lg", "bg-gold text-[#1a1405] hover:bg-gold/90")}>
            Register your school <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
