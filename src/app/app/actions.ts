"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACTIVE_SCHOOL_COOKIE, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation/auth";

/** Selects the active school — only among schools the server confirms the user belongs to. */
export async function switchSchool(formData: FormData) {
  const session = await requireSession();
  const schoolId = String(formData.get("schoolId") ?? "");
  if (!session.memberships.some((m) => m.schoolId === schoolId)) redirect("/app?denied=1");
  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, schoolId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  redirect("/school");
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.userId).is("read_at", null);
  revalidatePath("/app", "layout");
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(160),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+0-9 ()-]*$/, "Use digits, spaces and + only")
    .transform((v) => v || null),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone }).eq("id", session.userId);
  if (error) return { ok: false, message: "Could not save your details. Please try again." };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Your details have been saved." };
}
