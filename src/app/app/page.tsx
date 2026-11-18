import { ArrowRight, Building2, Globe2, Mail, School } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { switchSchool } from "@/app/app/actions";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody, PageHeader, type BadgeTone } from "@/components/ui/primitives";
import { requireSession, type SchoolStatus } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

const STATUS: Record<SchoolStatus, { label: string; tone: BadgeTone }> = {
  pending_verification: { label: "Awaiting verification", tone: "warning" },
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
  rejected: { label: "Not approved", tone: "danger" },
};

export default async function AppHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requireSession();
  const { denied } = await searchParams;

  // Send single-destination users straight to their workspace.
  if (!denied) {
    if (session.platform && session.memberships.length === 0) redirect("/platform");
    if (!session.platform && session.memberships.length === 1 && session.memberships[0].schoolStatus === "active") redirect("/school");
  }

  const supabase = await createClient();
  const { data: reasons } = await supabase.from("schools").select("id, status_reason").eq("registered_by", session.userId).not("status_reason", "is", null);
  const reasonFor = new Map((reasons ?? []).map((r) => [r.id, r.status_reason as string]));

  const firstName = (session.fullName ?? "").split(" ")[0];
  return (
    <>
      <PageHeader title={firstName ? `Welcome, ${firstName}` : "Welcome"} description="Choose where you want to work." />
      {denied && (
        <Alert tone="warning" className="mb-6">
          You don&apos;t have access to that page.
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {session.platform && (
          <Card>
            <CardBody className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-primary-soft p-2 text-primary"><Globe2 className="h-5 w-5" aria-hidden /></span>
                <div>
                  <p className="font-semibold">National platform</p>
                  <p className="text-sm text-muted-foreground">{session.platform.roleLabel}</p>
                </div>
              </div>
              <ButtonLink href="/platform" className="mt-auto self-start">
                Open platform console <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </CardBody>
          </Card>
        )}

        {session.memberships.map((m) => (
          <Card key={m.schoolId}>
            <CardBody className="flex h-full flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-md bg-royal-soft p-2 text-royal"><Building2 className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.schoolName}</p>
                  <p className="text-sm text-muted-foreground">{m.roleLabel}</p>
                </div>
                <Badge tone={STATUS[m.schoolStatus].tone}>{STATUS[m.schoolStatus].label}</Badge>
              </div>
              {m.schoolStatus === "pending_verification" && (
                <p className="text-sm text-muted-foreground">Platform staff are verifying this school. You&apos;ll be notified here and can then complete onboarding.</p>
              )}
              {(m.schoolStatus === "rejected" || m.schoolStatus === "suspended") && reasonFor.get(m.schoolId) && (
                <p className="text-sm text-muted-foreground">Reason: {reasonFor.get(m.schoolId)}</p>
              )}
              <form action={switchSchool} className="mt-auto">
                <input type="hidden" name="schoolId" value={m.schoolId} />
                <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
                  Open school workspace <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </CardBody>
          </Card>
        ))}
      </div>

      {!session.platform && session.memberships.length === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardBody className="space-y-3">
              <span className="inline-flex rounded-md bg-primary-soft p-2 text-primary"><School className="h-5 w-5" aria-hidden /></span>
              <p className="font-semibold">Register your school</p>
              <p className="text-sm text-muted-foreground">
                For headteachers and school administrators. Submit your school&apos;s official details; platform staff verify them before the school
                is activated.
              </p>
              <ButtonLink href="/register-school">Start registration</ButtonLink>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <span className="inline-flex rounded-md bg-surface-muted p-2 text-muted-foreground"><Mail className="h-5 w-5" aria-hidden /></span>
              <p className="font-semibold">Joining an existing school?</p>
              <p className="text-sm text-muted-foreground">
                Teachers, staff, students and parents are added by their school. Ask your school administrator to add <strong>{session.email}</strong>;
                the school will appear here once they do.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
