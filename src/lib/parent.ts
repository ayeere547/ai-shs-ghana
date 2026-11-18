import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type Child = { student_id: string; school_id: string; school_name: string; first_name: string; last_name: string; class_name: string | null; relationship: string };

/** The signed-in guardian and the children they are verified to represent (possibly across schools). */
export const getParentContext = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const parentMemberships = session.memberships.filter((m) => m.role === "parent");
  if (!parentMemberships.length) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("guardian_children");
  return { session, memberships: parentMemberships, children: (data ?? []) as Child[] };
});

export async function requireParent() {
  const ctx = await getParentContext();
  if (!ctx) redirect("/app");
  return ctx;
}

export async function requireChild(studentId: string) {
  const ctx = await requireParent();
  const child = ctx.children.find((c) => c.student_id === studentId);
  if (!child) redirect("/parent");
  return { ...ctx, child };
}
