import type { Metadata } from "next";

import { PromoteForm } from "@/components/students/forms";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { schoolLookups } from "@/lib/school/lookups";

export const metadata: Metadata = { title: "Promote students" };

export default async function PromotePage() {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const l = await schoolLookups(school.schoolId);
  return (
    <>
      <PageHeader
        title="Promote or graduate a class"
        description="At the end of the academic year, move each class up a form — start with the final year (graduate) so classes are free to receive the next group."
      />
      <Card>
        <CardBody>
          <PromoteForm classes={l.classes} />
        </CardBody>
      </Card>
    </>
  );
}
