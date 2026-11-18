import type { PlatformPermission, SchoolPermission } from "@/lib/auth/permissions";

export const CURRENT_PHASE = 1;

export type NavItem = { label: string; href: string; icon: string; phase: number };
export type NavSection = { title: string; items: NavItem[] };

type Gated<P> = NavItem & { permission?: P };

const PLATFORM_NAV: { title: string; items: Gated<PlatformPermission>[] }[] = [
  {
    title: "National platform",
    items: [
      { label: "Overview", href: "/platform", icon: "LayoutDashboard", phase: 1, permission: "platform.dashboard" },
      { label: "Schools", href: "/platform/schools", icon: "School", phase: 1, permission: "schools.read_all" },
      { label: "Platform staff", href: "/platform/users", icon: "ShieldCheck", phase: 1, permission: "platform.users.manage" },
      { label: "Audit log", href: "/platform/audit", icon: "ScrollText", phase: 1, permission: "platform.audit.read" },
    ],
  },
  {
    title: "Coming next",
    items: [
      { label: "Subscriptions", href: "/platform/subscriptions", icon: "CreditCard", phase: 6, permission: "subscriptions.manage" },
      { label: "AI usage", href: "/platform/ai-usage", icon: "Sparkles", phase: 4, permission: "analytics.national" },
      { label: "Support", href: "/platform/support", icon: "LifeBuoy", phase: 6, permission: "support.manage" },
    ],
  },
];

const SCHOOL_NAV: { title: string; items: Gated<SchoolPermission>[] }[] = [
  {
    title: "School",
    items: [
      { label: "Dashboard", href: "/school", icon: "LayoutDashboard", phase: 1, permission: "school.dashboard" },
      { label: "Onboarding", href: "/school/onboarding", icon: "ListChecks", phase: 1, permission: "school.settings.manage" },
      { label: "Academic setup", href: "/school/academics", icon: "GraduationCap", phase: 1, permission: "academics.read" },
      { label: "Staff & members", href: "/school/members", icon: "Users", phase: 1, permission: "members.read" },
      { label: "Settings", href: "/school/settings", icon: "Settings", phase: 1, permission: "school.settings.manage" },
      { label: "Audit log", href: "/school/audit", icon: "ScrollText", phase: 1, permission: "school.audit.read" },
    ],
  },
  {
    title: "Coming next",
    items: [
      { label: "Students", href: "/school/students", icon: "UserRound", phase: 2, permission: "academics.read" },
      { label: "Timetable", href: "/school/timetable", icon: "CalendarDays", phase: 2, permission: "academics.read" },
      { label: "Attendance", href: "/school/attendance", icon: "ClipboardCheck", phase: 2, permission: "academics.read" },
      { label: "AI teaching tools", href: "/school/ai", icon: "Sparkles", phase: 4, permission: "academics.read" },
    ],
  },
];

function filter<P>(nav: { title: string; items: Gated<P>[] }[], has: (p: P) => boolean): NavSection[] {
  return nav
    .map((s) => ({ title: s.title, items: s.items.filter((i) => !i.permission || has(i.permission)).map(({ permission: _p, ...i }) => i) }))
    .filter((s) => s.items.length > 0);
}

export const platformNavigation = (perms: Set<PlatformPermission>) => filter(PLATFORM_NAV, (p) => perms.has(p));
export const schoolNavigation = (perms: Set<SchoolPermission>) => filter(SCHOOL_NAV, (p) => perms.has(p));
