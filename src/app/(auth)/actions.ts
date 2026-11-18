"use server";

import { redirect } from "next/navigation";

import { publicEnv } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";
import { fieldErrors, forgotSchema, loginSchema, registerSchema, resetSchema, type FormState } from "@/lib/validation/auth";

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const ip = await clientIp();
  const limit = rateLimit(`login:${ip}:${parsed.data.email}`, 8, 15 * 60_000);
  if (!limit.ok) return { ok: false, message: `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { ok: false, message: "Confirm your email address first — check your inbox for the link." };
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  const { data: profile } = await supabase.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    return { ok: false, message: "This account is suspended. Contact a platform administrator." };
  }

  await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.user.id);
  await supabase.rpc("log_audit", { p_action: "auth.sign_in", p_entity_type: "session", p_summary: "Signed in with password" });
  redirect(safeNextPath(formData.get("next")?.toString()));
}

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000).ok) return { ok: false, message: "Too many registrations from this network. Try again later." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName }, emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/app` },
  });
  // Do not reveal whether an email is already registered.
  if (error && error.code !== "user_already_exists") {
    return { ok: false, message: error.code === "weak_password" ? "That password is too weak or appears in known breaches." : "Registration failed. Please try again." };
  }
  return { ok: true, message: "Check your email to confirm your address, then sign in. You can then register your school or accept an invitation from your school." };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const ip = await clientIp();
  if (rateLimit(`reset:${ip}`, 5, 60 * 60_000).ok) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password` });
  }
  // Same answer whether or not the account exists (prevents account enumeration).
  return { ok: true, message: "If an account exists for that address, a reset link is on its way. The link expires in one hour." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: error.code === "same_password" ? "Choose a password you have not used before." : "Could not update the password. Request a new link and try again." };

  await supabase.rpc("log_audit", { p_action: "auth.password_changed", p_entity_type: "profile", p_entity_id: user.id });
  // Revoke other sessions after a password change.
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Password updated. You can continue." };
}
