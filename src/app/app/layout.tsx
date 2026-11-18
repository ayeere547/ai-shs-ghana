import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/session";
import { shellUser, unreadNotifications } from "@/lib/shell";

const ACCOUNT_NAV = [
  {
    title: "Account",
    items: [
      { label: "Home", href: "/app", icon: "LayoutDashboard", phase: 1 },
      { label: "Register a school", href: "/register-school", icon: "School", phase: 1 },
      { label: "My account", href: "/app/account", icon: "UserRound", phase: 1 },
    ],
  },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell
      sections={ACCOUNT_NAV}
      unread={await unreadNotifications()}
      workspaces={[]}
      user={shellUser(session, session.platform?.roleLabel ?? session.memberships[0]?.roleLabel ?? "No role yet")}
    >
      {children}
    </AppShell>
  );
}
