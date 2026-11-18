import type { Metadata } from "next";

import { StudentForm } from "@/components/students/forms";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { schoolLookups } from "@/lib/school/lookups";

export const metadata: Metadata = { title: "Admit student" };

export default async function NewStudentPage() {
  const { school } = await requireSchoolPermission("students.manage", { write: true });
  const l = await schoolLookups(school.schoolId);
  return (
    <>
      <PageHeader title="Admit a student" description="Create the student's record. You can add guardians and register subjects next." />
      <Card>
        <CardBody>
          <StudentForm classes={l.classes} programmes={l.programmes} houses={l.houses} />
        </CardBody>
      </Card>
    </>
  );
}
