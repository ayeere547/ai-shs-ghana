"use client";

import {
  CalendarDays, ClipboardCheck, CreditCard, GraduationCap, LayoutDashboard, LifeBuoy, ListChecks, School, ScrollText, Settings,
  ShieldCheck, Sparkles, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CURRENT_PHASE, type NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand";

const ICONS: Record<string, LucideIcon> = {
  CalendarDays, ClipboardCheck, CreditCard, GraduationCap, LayoutDashboard, LifeBuoy, ListChecks, School, ScrollText, Settings,
  ShieldCheck, Sparkles, UserRound, Users,
};

const ROOTS = ["/platform", "/school"];

export function Sidebar({ sections, open, onClose, footer }: { sections: NavSection[]; open: boolean; onClose: () => void; footer?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-charcoal text-charcoal-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-4">
          <Link href="/app" aria-label="AI SHS Ghana home">
            <BrandMark inverted />
          </Link>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/70 hover:bg-white/10 lg:hidden" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{section.title}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  const active = ROOTS.includes(item.href) ? pathname === item.href : pathname.startsWith(item.href);
                  if (item.phase > CURRENT_PHASE) {
                    return (
                      <li key={item.href}>
                        <span className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-white/35" title={`Arrives in development phase ${item.phase}`} aria-disabled="true">
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">Phase {item.phase}</span>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                          active ? "border-gold bg-white/10 font-medium text-white" : "border-transparent text-white/75 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {footer && <div className="border-t border-white/10 px-4 py-3">{footer}</div>}
      </aside>
    </>
  );
}
