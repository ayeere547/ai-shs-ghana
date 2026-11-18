"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_SCHOOL_COOKIE, requireSession } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError, parseRegistrationForm, toRegistrationPayload } from "@/lib/validation/school";

export async function registerSchool(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = parseRegistrationForm(formData);
  if (!parsed.success) return { ...fieldErrors(parsed.error), message: "Please correct the highlighted fields.", values: formValues(formData) };

  const ip = await clientIp();
  if (!rateLimit(`register-school:${session.userId}:${ip}`, 5, 60 * 60_000).ok) {
    return { ok: false, message: "Too many registration attempts. Please try again later." };
  }

  const supabase = await createClient();
  const { data: schoolId, error } = await supabase.rpc("register_school", { p: toRegistrationPayload(parsed.data) });
  if (error || !schoolId) return { ok: false, values: formValues(formData), message: friendlyDbError(error?.message, "We couldn't submit the registration. Please try again.") };

  (await cookies()).set(ACTIVE_SCHOOL_COOKIE, String(schoolId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/school?registered=1");
}
