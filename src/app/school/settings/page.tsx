import type { Metadata } from "next";

import { BrandingForm, SchoolProfileForm, SchoolSettingsForm } from "@/components/school/settings-forms";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { loadSchoolConfig, logoUrl } from "@/lib/school/settings";

export const metadata: Metadata = { title: "School settings" };

export default async function SchoolSettingsPage() {
  const { school } = await requireSchoolPermission("school.settings.manage");
  const { school: profile, branding, settings } = await loadSchoolConfig(school.schoolId);
  const readOnly = school.schoolStatus !== "active";

  return (
    <>
      <PageHeader title="School settings" description={`${profile?.name ?? school.schoolName}${profile?.school_code ? ` · ${profile.school_code}` : ""}`} />
      {readOnly && <Alert tone="warning" className="mb-6">Settings can be changed once the school is active.</Alert>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="School profile" description="Contact details and public directory listing." />
          <CardBody>{profile && <SchoolProfileForm school={profile} disabled={readOnly} />}</CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Branding" description="Used on school documents, reports and portals." />
            <CardBody>{branding && <BrandingForm branding={branding} logoUrl={logoUrl(branding.logo_path)} disabled={readOnly || !school.permissions.has("school.branding.manage")} />}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Academic settings" />
            <CardBody>{settings && <SchoolSettingsForm settings={settings} disabled={readOnly} />}</CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
