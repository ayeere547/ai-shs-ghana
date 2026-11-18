import type { Metadata } from "next";

import { requestAccountDeletion } from "@/app/support-actions";
import { ActionForm } from "@/components/ui/action-form";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Card, CardBody, CardHeader, PageHeader, Textarea } from "@/components/ui/primitives";
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
        <Card className="lg:col-span-2">
          <CardHeader title="Your data" description="Your rights under Ghana's Data Protection Act, 2012 (Act 843)." />
          <CardBody className="grid gap-6 text-sm md:grid-cols-2">
            <div className="space-y-3">
              <p className="font-medium">Download a copy</p>
              <p className="text-muted-foreground">
                A file with your profile, school roles, notifications, messages you sent, support requests and recent activity. Records your school
                keeps about students and staff are managed by the school — ask the school office for those.
              </p>
              {/* A plain link: the route returns a file download. */}
              <a href="/app/account/export" className={buttonClass("secondary", "sm")} download>Download my data (JSON)</a>
              <p className="text-muted-foreground">To correct something, edit it above or ask the school that holds the record.</p>
            </div>
            <div className="space-y-3">
              <p className="font-medium">Delete my account</p>
              <p className="text-muted-foreground">
                We&apos;ll confirm your identity and remove your account. Schools may need to keep some records (for example results and fee receipts)
                for their legal duties; we&apos;ll tell you what is kept and why.
              </p>
              <ActionForm action={requestAccountDeletion}>
                <Textarea name="reason" rows={2} maxLength={1000} placeholder="Reason (optional)" aria-label="Reason (optional)" />
                <label className="flex items-center gap-2"><input type="checkbox" name="confirm" className="h-4 w-4 accent-[var(--royal)]" /> I want my account deleted</label>
                <SubmitButton size="sm" variant="secondary">Send deletion request</SubmitButton>
              </ActionForm>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
