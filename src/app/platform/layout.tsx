import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/session";
import { platformNavigation } from "@/lib/navigation";
import { buildWorkspaces, shellUser, unreadNotifications } from "@/lib/shell";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.platform) redirect("/app?denied=1");
  return (
    <AppShell
      sections={platformNavigation(session.platform.permissions)}
      unread={await unreadNotifications()}
      workspaces={buildWorkspaces(session, { kind: "platform" })}
      user={shellUser(session, session.platform.roleLabel)}
    >
      {children}
    </AppShell>
  );
}
