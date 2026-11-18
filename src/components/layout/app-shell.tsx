"use client";

import { Bell, Building2, Check, ChevronsUpDown, Globe2, LogOut, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { switchSchool } from "@/app/app/actions";
import type { NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export type ShellUser = { name: string; email: string; roleLabel: string };
export type Workspace = { kind: "platform" | "school"; id: string; label: string; detail: string; current: boolean };

export function AppShell({
  sections,
  user,
  unread,
  workspaces,
  banner,
  children,
}: {
  sections: NavSection[];
  user: ShellUser;
  unread: number;
  workspaces: Workspace[];
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const current = workspaces.find((w) => w.current);
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        sections={sections}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        footer={<p className="text-[11px] leading-relaxed text-white/45">Each school&apos;s records are isolated and every administrative action is logged.</p>}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-4 sm:gap-3 sm:px-6">
          <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-surface-muted lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          {current && <WorkspaceSwitcher current={current} workspaces={workspaces} />}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/app/notifications" className="relative rounded-md p-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-royal px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
              )}
            </Link>
            <UserMenu user={user} />
          </div>
        </header>
        {banner}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function useOutsideClose(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, setOpen]);
  return ref;
}

function WorkspaceSwitcher({ current, workspaces }: { current: Workspace; workspaces: Workspace[] }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  const Icon = current.kind === "platform" ? Globe2 : Building2;
  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={workspaces.length < 2}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted disabled:hover:bg-transparent"
      >
        <span className="rounded-md bg-primary-soft p-1.5 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{current.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{current.detail}</span>
        </span>
        {workspaces.length > 1 && <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-12 z-20 w-72 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
          {workspaces.map((w) =>
            w.kind === "platform" ? (
              <Link key="platform" role="menuitem" href="/platform" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted" onClick={() => setOpen(false)}>
                <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate">{w.label}</span>
                {w.current && <Check className="h-4 w-4 text-royal" aria-hidden />}
              </Link>
            ) : (
              <form key={w.id} action={switchSchool}>
                <input type="hidden" name="schoolId" value={w.id} />
                <button role="menuitem" type="submit" className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted")}>
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{w.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{w.detail}</span>
                  </span>
                  {w.current && <Check className="h-4 w-4 text-royal" aria-hidden />}
                </button>
              </form>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  const initials = user.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "U";
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 hover:bg-surface-muted" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-20 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-royal">{user.roleLabel}</p>
          </div>
          <Link role="menuitem" href="/app/account" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-muted" onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4" /> My account
          </Link>
          <form action="/auth/signout" method="post" className="border-t border-border">
            <button role="menuitem" type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger hover:bg-surface-muted">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
