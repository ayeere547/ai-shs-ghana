import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/callback; without that session there is nothing to reset.
  if (!(await getSession())) redirect("/forgot-password");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Other signed-in devices will be signed out once you save.</p>
      <div className="mt-6">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
