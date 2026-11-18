import type { Metadata } from "next";

import { BrandMark } from "@/components/layout/brand";
import { integrationStatus, isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  const ready = isSupabaseConfigured();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <BrandMark />
      <h1 className="mt-8 text-2xl font-semibold">{ready ? "Configuration status" : "Finish configuring the platform"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code>, fill in the values, apply the database migrations, then restart the
        server. Full steps: <code className="font-mono">docs/INSTALLATION.md</code>.
      </p>
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
        {integrationStatus().map((i) => (
          <li key={i.key} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">{i.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{i.envVars.join(", ")}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${i.configured ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning"}`}>
              {i.configured ? "Configured" : i.required ? "Required" : "Optional"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
