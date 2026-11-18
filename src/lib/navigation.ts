import type { PlatformPermission, SchoolPermission } from "@/lib/auth/permissions";

export const CURRENT_PHASE = 3;

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

type SchoolGated = Gated<SchoolPermission> & { anyOf?: SchoolPermission[] };

const SCHOOL_NAV: { title: string; items: SchoolGated[] }[] = [
  {
    title: "School",
    items: [
      { label: "Dashboard", href: "/school", icon: "LayoutDashboard", phase: 1, permission: "school.dashboard" },
      { label: "Onboarding", href: "/school/onboarding", icon: "ListChecks", phase: 1, permission: "school.settings.manage" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Students", href: "/school/students", icon: "UserRound", phase: 2, permission: "students.read" },
      { label: "Staff", href: "/school/staff", icon: "BriefcaseBusiness", phase: 2, permission: "staff.read" },
      { label: "Members & access", href: "/school/members", icon: "Users", phase: 1, permission: "members.read" },
    ],
  },
  {
    title: "Academics",
    items: [
      { label: "Timetable", href: "/school/timetable", icon: "CalendarDays", phase: 2, permission: "academics.read" },
      { label: "Attendance", href: "/school/attendance", icon: "ClipboardCheck", phase: 2, anyOf: ["attendance.record", "attendance.manage"] },
      { label: "Assessments", href: "/school/assessments", icon: "FileCheck2", phase: 2, anyOf: ["assessments.record", "assessments.manage"] },
      { label: "Results", href: "/school/results", icon: "BarChart3", phase: 2, anyOf: ["results.read", "assessments.record", "assessments.manage"] },
      { label: "Academic setup", href: "/school/academics", icon: "GraduationCap", phase: 1, permission: "academics.read" },
    ],
  },
  {
    title: "Teaching & learning",
    items: [
      { label: "Classroom", href: "/school/classroom", icon: "BookOpen", phase: 3, anyOf: ["classroom.teach", "classroom.manage"] },
      { label: "Assignments", href: "/school/assignments", icon: "NotebookPen", phase: 3, anyOf: ["classroom.teach", "classroom.manage"] },
      { label: "Online exams", href: "/school/exams", icon: "Timer", phase: 3, anyOf: ["classroom.teach", "classroom.manage"] },
      { label: "Question bank", href: "/school/questions", icon: "ListChecks", phase: 3, anyOf: ["classroom.teach", "classroom.manage"] },
      { label: "Digital library", href: "/school/library", icon: "Library", phase: 3, permission: "academics.read" },
      { label: "Announcements", href: "/school/announcements", icon: "Megaphone", phase: 3, permission: "school.dashboard" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Settings", href: "/school/settings", icon: "Settings", phase: 1, permission: "school.settings.manage" },
      { label: "Audit log", href: "/school/audit", icon: "ScrollText", phase: 1, permission: "school.audit.read" },
    ],
  },
  {
    title: "Coming next",
    items: [
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
export const schoolNavigation = (perms: Set<SchoolPermission>) =>
  filter(
    SCHOOL_NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.anyOf || i.anyOf.some((p) => perms.has(p))).map(({ anyOf: _a, ...i }) => i) })),
    (p) => perms.has(p),
  );
