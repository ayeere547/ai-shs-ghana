import { Building2, LifeBuoy, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Prose } from "@/components/marketing/blocks";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  const email = publicEnv.supportEmail;
  return (
    <Prose title="Contact us">
      <p>We&apos;d like to hear from school leaders, teachers, parents and education partners.</p>
      <div className="grid gap-4 not-prose sm:grid-cols-3">
        {[
          { icon: Building2, title: "Register a school", body: "Create an account and submit your school for verification.", href: "/register", cta: "Start registration" },
          { icon: LifeBuoy, title: "Help centre", body: "Answers to common questions about getting started.", href: "/help", cta: "Visit help centre" },
          { icon: Mail, title: "Email us", body: email ? email : "Our contact address will be published here shortly.", href: email ? `mailto:${email}` : "/help", cta: email ? "Send an email" : "See help centre" },
        ].map((c) => (
          <div key={c.title} className="rounded-lg border border-border bg-surface p-5">
            <c.icon className="h-5 w-5 text-royal" aria-hidden />
            <p className="mt-3 font-semibold">{c.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            <Link href={c.href} className="mt-3 inline-block text-sm font-medium text-royal hover:underline">{c.cta}</Link>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Please don&apos;t send student records or other personal data by email. Schools can share records securely inside the platform.</p>
    </Prose>
  );
}
