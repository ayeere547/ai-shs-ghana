import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import type { PlatformPermission, PlatformRoleKey, SchoolPermission, SchoolRoleKey } from "./permissions";

export type SchoolStatus = "pending_verification" | "active" | "suspended" | "rejected";

export type Membership = {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  schoolStatus: SchoolStatus;
  onboardingCompleted: boolean;
  role: SchoolRoleKey;
  roleLabel: string;
  rank: number;
  permissions: Set<SchoolPermission>;
};

export type Session = {
  userId: string;
  email: string;
  fullName: string | null;
  platform: { role: PlatformRoleKey; roleLabel: string; rank: number; permissions: Set<PlatformPermission> } | null;
  memberships: Membership[];
};

export const ACTIVE_SCHOOL_COOKIE = "active_school";

type MembershipRow = {
  id: string;
  role_id: string;
  schools: { id: string; name: string; slug: string; status: SchoolStatus; onboarding_completed_at: string | null } | null;
  roles: { key: SchoolRoleKey; label: string; rank: number } | null;
};

/** Loads the signed-in user, platform role and school memberships with effective permissions (once per request, under RLS). */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: platformRow }, { data: membershipRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, status").eq("id", user.id).maybeSingle(),
    supabase.from("platform_users").select("role_id, roles(key, label, rank)").eq("user_id", user.id).maybeSingle<{ role_id: string; roles: { key: PlatformRoleKey; label: string; rank: number } | null }>(),
    supabase
      .from("school_memberships")
      .select("id, role_id, schools(id, name, slug, status, onboarding_completed_at), roles(key, label, rank)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .returns<MembershipRow[]>(),
  ]);

  const base = { userId: user.id, email: user.email ?? profile?.email ?? "", fullName: profile?.full_name ?? null };
  if (profile?.status === "suspended") return { ...base, platform: null, memberships: [] };

  const roleIds = [...new Set([platformRow?.role_id, ...(membershipRows ?? []).map((m) => m.role_id)].filter(Boolean) as string[])];
  const { data: grants } = roleIds.length
    ? await supabase.from("role_permissions").select("role_id, permission_key").in("role_id", roleIds)
    : { data: [] as { role_id: string; permission_key: string }[] };
  const permsFor = <P extends string>(roleId: string) => new Set((grants ?? []).filter((g) => g.role_id === roleId).map((g) => g.permission_key as P));

  return {
    ...base,
    platform:
      platformRow?.roles != null
        ? { role: platformRow.roles.key, roleLabel: platformRow.roles.label, rank: platformRow.roles.rank, permissions: permsFor<PlatformPermission>(platformRow.role_id) }
        : null,
    memberships: (membershipRows ?? [])
      .filter((m) => m.schools && m.roles)
      .map((m) => ({
        membershipId: m.id,
        schoolId: m.schools!.id,
        schoolName: m.schools!.name,
        schoolSlug: m.schools!.slug,
        schoolStatus: m.schools!.status,
        onboardingCompleted: Boolean(m.schools!.onboarding_completed_at),
        role: m.roles!.key,
        roleLabel: m.roles!.label,
        rank: m.roles!.rank,
        permissions: permsFor<SchoolPermission>(m.role_id),
      }))
      .sort((a, b) => a.schoolName.localeCompare(b.schoolName)),
  };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requirePlatformPermission(permission: PlatformPermission): Promise<Session> {
  const session = await requireSession();
  if (!session.platform?.permissions.has(permission)) redirect(session.platform ? "/platform?denied=1" : "/app?denied=1");
  return session;
}

/**
 * The school the user is currently working in. The cookie only CHOOSES among memberships the server
 * has just loaded for this user — a school the user doesn't belong to can never be selected, and RLS
 * re-checks every query regardless.
 */
export async function getSchoolContext(): Promise<{ session: Session; school: Membership } | null> {
  const session = await getSession();
  if (!session || session.memberships.length === 0) return null;
  const wanted = (await cookies()).get(ACTIVE_SCHOOL_COOKIE)?.value;
  const school = session.memberships.find((m) => m.schoolId === wanted) ?? session.memberships[0];
  return { session, school };
}

export async function requireSchool(): Promise<{ session: Session; school: Membership }> {
  const ctx = await getSchoolContext();
  if (!ctx) {
    await requireSession();
    redirect("/app");
  }
  return ctx;
}

/** Guards a school page or action. `write` additionally requires the school to be active (as the database does). */
export async function requireSchoolPermission(permission: SchoolPermission, { write = false } = {}) {
  const ctx = await requireSchool();
  if (!ctx.school.permissions.has(permission) || (write && ctx.school.schoolStatus !== "active")) redirect("/school?denied=1");
  return ctx;
}

export const canSchool = (m: Membership | null | undefined, p: SchoolPermission) => Boolean(m?.permissions.has(p));
export const canPlatform = (s: Session | null | undefined, p: PlatformPermission) => Boolean(s?.platform?.permissions.has(p));
