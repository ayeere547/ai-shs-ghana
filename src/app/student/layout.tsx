import { AppShell } from "@/components/layout/app-shell";
import type { NavSection } from "@/lib/navigation";
import { buildWorkspaces, shellUser, unreadNotifications } from "@/lib/shell";
import { requireStudent } from "@/lib/student";

const NAV: NavSection[] = [
  {
    title: "My learning",
    items: [
      { label: "Home", href: "/student", icon: "LayoutDashboard", phase: 3 },
      { label: "Classroom", href: "/student/classroom", icon: "BookOpen", phase: 3 },
      { label: "Assignments", href: "/student/assignments", icon: "NotebookPen", phase: 3 },
      { label: "Exams & practice", href: "/student/exams", icon: "Timer", phase: 3 },
      { label: "Results", href: "/student/results", icon: "BarChart3", phase: 3 },
      { label: "Library", href: "/student/library", icon: "Library", phase: 3 },
    ],
  },
  {
    title: "Coming next",
    items: [{ label: "AI tutor", href: "/student/tutor", icon: "Sparkles", phase: 4 }],
  },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, school } = await requireStudent();
  return (
    <AppShell sections={NAV} unread={await unreadNotifications()} workspaces={buildWorkspaces(session, { kind: "school", schoolId: school.schoolId })} user={shellUser(session, `Student · ${school.schoolName}`)}>
      {children}
    </AppShell>
  );
}
