import { AppShell } from "@/components/layout/app-shell";
import type { NavSection } from "@/lib/navigation";
import { requireParent } from "@/lib/parent";
import { shellUser, unreadNotifications } from "@/lib/shell";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { session, children: kids } = await requireParent();
  const nav: NavSection[] = [
    { title: "Family", items: [{ label: "Home", href: "/parent", icon: "LayoutDashboard", phase: 5 }] },
    { title: "My children", items: kids.map((k) => ({ label: `${k.first_name} ${k.last_name}`, href: `/parent/child/${k.student_id}`, icon: "UserRound", phase: 5 })) },
  ].filter((s) => s.items.length);
  return (
    <AppShell sections={nav} unread={await unreadNotifications()} workspaces={[]} user={shellUser(session, "Parent / guardian")}>
      {children}
    </AppShell>
  );
}
