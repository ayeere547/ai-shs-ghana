import "server-only";

import type { Workspace } from "@/components/layout/app-shell";
import type { Session } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  pending_verification: "awaiting verification",
  active: "",
  suspended: "suspended",
  rejected: "not approved",
};

/** The workspaces (platform console + each school) the signed-in user may switch between. */
export function buildWorkspaces(session: Session, current: { kind: "platform" } | { kind: "school"; schoolId: string } | null): Workspace[] {
  const list: Workspace[] = [];
  if (session.platform) {
    list.push({ kind: "platform", id: "platform", label: "National platform", detail: session.platform.roleLabel, current: current?.kind === "platform" });
  }
  for (const m of session.memberships) {
    const status = STATUS_LABEL[m.schoolStatus];
    list.push({
      kind: "school",
      id: m.schoolId,
      label: m.schoolName,
      detail: status ? `${m.roleLabel} · ${status}` : m.roleLabel,
      current: current?.kind === "school" && current.schoolId === m.schoolId,
    });
  }
  return list;
}

export async function unreadNotifications() {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export function shellUser(session: Session, roleLabel: string) {
  return { name: session.fullName ?? session.email, email: session.email, roleLabel };
}
