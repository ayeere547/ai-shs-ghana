import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { isEmailConfigured, isSmsConfigured } from "@/lib/notify/channels";

import { NotificationForm } from "./notification-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", session.userId).single(),
    supabase.from("notification_preferences").select("email_enabled, sms_enabled, sms_phone, categories").eq("user_id", session.userId).maybeSingle(),
  ]);

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
        <Card className="lg:row-span-2">
          <CardHeader title="Notifications" description="How AI SHS Ghana keeps you informed." />
          <CardBody>
            <NotificationForm prefs={prefs ?? { email_enabled: true, sms_enabled: false, sms_phone: null, categories: {} }} emailAvailable={isEmailConfigured()} smsAvailable={isSmsConfigured()} />
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
