import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/layout/brand";
import { requireSession } from "@/lib/auth/session";

import { RegistrationForm } from "./registration-form";

export const metadata: Metadata = { title: "Register your school" };

const STEPS = ["Register school", "Platform verifies details", "Administrator account", "Branding", "Academic year & terms", "Programmes & classes", "Add staff", "Import students", "School settings", "Launch"];

export default async function RegisterSchoolPage() {
  const session = await requireSession();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/app" aria-label="Back to your account">
            <BrandMark />
          </Link>
          <Link href="/app" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_15rem]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Register your school</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step 1 of onboarding. We only ask for what is needed to verify the school; everything else is configured after activation.
          </p>
          <div className="mt-6">
            <RegistrationForm defaultEmail={session.email} />
          </div>
        </div>
        <aside className="order-first lg:order-none">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Onboarding steps</p>
          <ol className="space-y-2 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground"}`}>{i + 1}</span>
                <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>{s}</span>
              </li>
            ))}
          </ol>
        </aside>
      </main>
    </div>
  );
}
