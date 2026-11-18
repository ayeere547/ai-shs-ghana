import { CheckCircle2, Circle, Lock, Rocket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { InviteForm } from "@/components/school/invite-form";
import { ResourceManager } from "@/components/school/resource-manager";
import { BrandingForm, SchoolSettingsForm } from "@/components/school/settings-forms";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { assignableSchoolRoles } from "@/lib/auth/permissions";
import { requireSchoolPermission } from "@/lib/auth/session";
import { canLaunch, onboardingSteps, progressPercent, type OnboardingStep } from "@/lib/school/onboarding";
import { schoolCounts } from "@/lib/school/queries";
import { loadSchoolConfig, logoUrl } from "@/lib/school/settings";
import { cn } from "@/lib/utils";

import { launchSchool } from "../settings/actions";

export const metadata: Metadata = { title: "Onboarding" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; edit?: string; error?: string }> }) {
  const { school } = await requireSchoolPermission("school.settings.manage");
  const params = await searchParams;
  const counts = await schoolCounts(school.schoolId);
  const steps = onboardingSteps(counts.onboarding);
  const firstOpen = steps.find((s) => s.available && !s.done) ?? steps[steps.length - 1];
  const requested = Number.parseInt(params.step ?? "", 10);
  const step = steps.find((s) => s.number === requested) ?? firstOpen;
  const href = (n: number, extra = "") => `/school/onboarding?step=${n}${extra}`;

  return (
    <>
      <PageHeader title="Set up your school" description={`${progressPercent(steps)}% complete · Steps unlock once the school is verified.`} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Onboarding steps">
          <ol className="space-y-1">
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={href(s.number)}
                  aria-current={s.number === step.number ? "step" : undefined}
                  className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm", s.number === step.number ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-surface")}
                >
                  <StepIcon step={s} />
                  <span className="flex-1">{s.title}</span>
                  {!s.required && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Optional</span>}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {step.number} of 10</p>
            <h2 className="text-lg font-semibold">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
          {params.error && <Alert tone="danger">The school could not be launched. Make sure the required steps are complete.</Alert>}
          <StepBody step={step} steps={steps} schoolId={school.schoolId} rank={school.rank} status={school.schoolStatus} editId={params.edit} href={href} />
          <div className="flex justify-between border-t border-border pt-4">
            {step.number > 1 ? <ButtonLink href={href(step.number - 1)} variant="ghost">Back</ButtonLink> : <span />}
            {step.number < 10 && <ButtonLink href={href(step.number + 1)} variant="secondary">Next step</ButtonLink>}
          </div>
        </div>
      </div>
    </>
  );
}

function StepIcon({ step }: { step: OnboardingStep }) {
  if (step.done) return <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-label="Done" />;
  if (!step.available) return <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not available yet" />;
  return <Circle className="h-4 w-4 shrink-0" aria-label="To do" />;
}

async function StepBody({ step, steps, schoolId, rank, status, editId, href }: { step: OnboardingStep; steps: OnboardingStep[]; schoolId: string; rank: number; status: string; editId?: string; href: (n: number, extra?: string) => string }) {
  if (step.number <= 3) {
    return (
      <Card>
        <CardBody className="text-sm">
          {step.done ? (
            <Alert tone="success">{step.number === 2 ? "Your school has been verified by platform staff." : "Complete."}</Alert>
          ) : (
            <Alert tone="info" title="Awaiting verification">Platform staff are checking your school&apos;s details. You&apos;ll receive a notification when this is done.</Alert>
          )}
        </CardBody>
      </Card>
    );
  }
  if (!step.available) {
    return (
      <Card>
        <EmptyState icon={Lock} title={status === "active" ? "Not available yet" : "Unlocks after verification"}>
          {step.note ?? "This step becomes available once platform staff verify your school."}
        </EmptyState>
      </Card>
    );
  }

  const config = step.key === "branding" || step.key === "settings" ? await loadSchoolConfig(schoolId) : null;
  switch (step.key) {
    case "branding":
      return (
        <Card>
          <CardBody>{config?.branding && <BrandingForm branding={config.branding} logoUrl={logoUrl(config.branding.logo_path)} />}</CardBody>
        </Card>
      );
    case "calendar":
      return (
        <div className="space-y-6">
          <ResourceManager resource="years" schoolId={schoolId} canManage editId={editId} hrefFor={(id) => href(5, id ? `&edit=${id}` : "")} />
          <ResourceManager resource="terms" schoolId={schoolId} canManage editId={editId} hrefFor={(id) => href(5, id ? `&edit=${id}` : "")} />
        </div>
      );
    case "structure":
      return (
        <div className="space-y-6">
          <ResourceManager resource="programmes" schoolId={schoolId} canManage editId={editId} hrefFor={(id) => href(6, id ? `&edit=${id}` : "")} />
          <ResourceManager resource="classes" schoolId={schoolId} canManage editId={editId} hrefFor={(id) => href(6, id ? `&edit=${id}` : "")} />
          <p className="text-sm text-muted-foreground">
            Subjects, departments and houses can be added any time under <Link href="/school/academics?tab=subjects" className="font-medium text-royal hover:underline">Academic setup</Link>.
          </p>
        </div>
      );
    case "staff":
      return (
        <Card>
          <CardHeader title="Invite staff" description="Add your assistant heads, administrators and teachers. You can manage everyone later under Staff & members." />
          <CardBody>
            <InviteForm roles={assignableSchoolRoles(rank).filter((r) => r.staff).map(({ key, label }) => ({ key, label }))} />
          </CardBody>
        </Card>
      );
    case "settings":
      return (
        <Card>
          <CardBody>{config?.settings && <SchoolSettingsForm settings={config.settings} />}</CardBody>
        </Card>
      );
    case "launch": {
      const ready = canLaunch(steps);
      if (step.done) return <Alert tone="success" title="Your school is live">You can revisit any step to change your configuration.</Alert>;
      return (
        <Card>
          <CardBody className="space-y-4">
            {ready ? (
              <p className="text-sm">All required steps are complete. Launching marks your setup as finished; staff you&apos;ve added already have access.</p>
            ) : (
              <Alert tone="warning" title="Finish the required steps first">
                {steps.filter((s) => s.required && !s.done && s.key !== "launch").map((s) => s.title).join(", ")}
              </Alert>
            )}
            <form action={launchSchool}>
              {ready && (
                <SubmitButton size="lg">
                  <Rocket className="h-4 w-4" /> Launch school dashboard
                </SubmitButton>
              )}
            </form>
          </CardBody>
        </Card>
      );
    }
    default:
      return null;
  }
}
