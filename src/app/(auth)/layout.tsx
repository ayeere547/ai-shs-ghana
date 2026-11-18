import Link from "next/link";

import { BrandMark } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-charcoal p-10 text-charcoal-foreground lg:flex">
        <Link href="/" aria-label="AI SHS Ghana home">
          <BrandMark inverted />
        </Link>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">Every school. Every learner. One secure platform.</h2>
          <p className="text-sm leading-relaxed text-white/65">
            School management, AI-supported teaching and learning, and parent communication for Ghanaian Senior High Schools — with each school&apos;s
            records kept strictly separate.
          </p>
        </div>
        <p className="text-xs text-white/45">Access is logged and personal data is processed in line with the Data Protection Act, 2012 (Act 843).</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-royal/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-gold/20 blur-3xl" aria-hidden />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden" aria-label="AI SHS Ghana home">
            <BrandMark />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
