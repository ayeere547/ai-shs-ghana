import { AppShell } from "@/components/layout/app-shell";
import { requireSchool } from "@/lib/auth/session";
import { schoolNavigation } from "@/lib/navigation";
import { buildWorkspaces, shellUser, unreadNotifications } from "@/lib/shell";

const BANNERS = {
  pending_verification: { cls: "border-warning/30 bg-warning-soft text-warning", text: "This school is awaiting verification by platform staff. Configuration unlocks once it is approved." },
  suspended: { cls: "border-danger/30 bg-danger-soft text-danger", text: "This school's account is suspended. Records are read-only. Contact AI SHS Ghana support." },
  rejected: { cls: "border-danger/30 bg-danger-soft text-danger", text: "This registration was not approved. See the reason on your home page." },
} as const;

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { session, school } = await requireSchool();
  const banner = school.schoolStatus !== "active" ? BANNERS[school.schoolStatus] : null;
  return (
    <AppShell
      sections={schoolNavigation(school.permissions)}
      unread={await unreadNotifications()}
      workspaces={buildWorkspaces(session, { kind: "school", schoolId: school.schoolId })}
      user={shellUser(session, school.roleLabel)}
      banner={banner && <div className={`border-b px-4 py-2 text-center text-xs font-medium sm:px-6 ${banner.cls}`} role="status">{banner.text}</div>}
    >
      {children}
    </AppShell>
  );
}
