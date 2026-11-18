import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing", description: "Free, Starter, Professional and Enterprise plans for Ghanaian SHSs, with sponsored and subsidised options." };

type Plan = { code: string; name: string; description: string | null; price_monthly_ghs: number | null; price_annual_ghs: number | null; features: string[] };

const ghs = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 });

export default async function PricingPage() {
  let plans: Plan[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("subscription_plans").select("code, name, description, price_monthly_ghs, price_annual_ghs, features").order("sort");
    plans = (data ?? []) as Plan[];
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pricing</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Every school starts free. Paid plans unlock as features ship. Because public schools are funded differently, we also support sponsored,
        institution-funded and subsidised plans — <Link href="/contact" className="font-medium text-royal hover:underline">talk to us</Link>.
      </p>

      {plans.length === 0 ? (
        <p className="mt-10 rounded-lg border border-border bg-surface p-6 text-sm text-muted-foreground">Plan details are temporarily unavailable. Please check back shortly.</p>
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const featured = p.code === "professional";
            return (
              <div key={p.code} className={cn("flex flex-col rounded-lg border bg-surface p-6", featured ? "border-royal shadow-md ring-1 ring-royal/30" : "border-border")}>
                {featured && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-royal">Most complete</p>}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                <p className="mt-5 text-2xl font-semibold">
                  {p.code === "free" ? "GH₵0" : p.price_monthly_ghs != null ? <>{ghs.format(p.price_monthly_ghs)}<span className="text-sm font-normal text-muted-foreground"> / month</span></> : <span className="text-base">Contact us</span>}
                </p>
                {p.price_annual_ghs != null && <p className="text-xs text-muted-foreground">{ghs.format(p.price_annual_ghs)} billed annually</p>}
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{f}</li>
                  ))}
                </ul>
                <Link href={p.code === "free" ? "/register" : "/contact"} className={buttonClass(featured ? "primary" : "secondary", "md", "mt-6")}>
                  {p.code === "free" ? "Register free" : "Talk to us"}
                </Link>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">Prices in Ghana cedis. AI features and online payments (Paystack / Hubtel) are rolling out in later development phases; paid plans are arranged directly with our team until then.</p>
    </div>
  );
}
