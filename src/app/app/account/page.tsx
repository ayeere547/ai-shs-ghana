import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", session.userId).single();

  return (
    <>
      <PageHeader title="My account" description={session.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" description="Shown to administrators of the schools you belong to." />
          <CardBody>
            <ProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Security" description="Change your password with a secure email link." />
          <CardBody className="space-y-3 text-sm text-muted-foreground">
            <p>For your protection, password changes are confirmed through your email address. Other signed-in devices are signed out afterwards.</p>
            <ButtonLink href="/forgot-password" variant="secondary">Send password reset link</ButtonLink>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
