"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandMark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/for/schools", label: "Schools" },
  { href: "/for/students", label: "Students" },
  { href: "/for/teachers", label: "Teachers" },
  { href: "/for/parents", label: "Parents" },
  { href: "/pricing", label: "Pricing" },
  { href: "/schools", label: "Directory" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="AI SHS Ghana home" className="shrink-0">
          <BrandMark tagline={false} />
        </Link>
        <nav className="hidden flex-1 items-center gap-1 xl:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-md px-3 py-2 text-sm", pathname.startsWith(n.href) ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/app" className={buttonClass("primary", "sm")}>Open AI SHS Ghana</Link>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost", "sm", "hidden sm:inline-flex")}>Sign in</Link>
              <Link href="/register" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>Register a school</Link>
            </>
          )}
          <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-surface-muted xl:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-border px-4 py-3 xl:hidden" aria-label="Mobile">
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm hover:bg-surface-muted">{n.label}</Link>
              </li>
            ))}
            {!signedIn && (
              <li className="flex gap-2 pt-2">
                <Link href="/login" className={buttonClass("secondary", "sm", "flex-1")}>Sign in</Link>
                <Link href="/register" className={buttonClass("primary", "sm", "flex-1")}>Register a school</Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}

const FOOTER = [
  { title: "Platform", links: [{ href: "/features", label: "Features" }, { href: "/features#ai", label: "AI learning" }, { href: "/features#wassce", label: "WASSCE preparation" }, { href: "/pricing", label: "Pricing" }, { href: "/schools", label: "School directory" }] },
  { title: "Who it's for", links: [{ href: "/for/schools", label: "Schools" }, { href: "/for/students", label: "Students" }, { href: "/for/teachers", label: "Teachers" }, { href: "/for/parents", label: "Parents" }] },
  { title: "Company", links: [{ href: "/about", label: "About us" }, { href: "/contact", label: "Contact" }, { href: "/help", label: "Help centre" }] },
  { title: "Legal", links: [{ href: "/privacy", label: "Privacy policy" }, { href: "/terms", label: "Terms and conditions" }, { href: "/data-protection", label: "Data protection" }] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <BrandMark />
          <p className="max-w-xs text-sm text-muted-foreground">AI-powered school management and learning for Ghanaian Senior High Schools.</p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-muted-foreground hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} AI SHS Ghana. An independent platform — not affiliated with or endorsed by GES, NaCCA, WAEC or the Ministry of Education.
        </p>
      </div>
    </footer>
  );
}
