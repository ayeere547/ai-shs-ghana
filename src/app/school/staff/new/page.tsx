import type { Metadata } from "next";

import { StaffForm } from "@/components/staff/forms";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { schoolLookups } from "@/lib/school/lookups";

export const metadata: Metadata = { title: "Add staff member" };

export default async function NewStaffPage() {
  const { school } = await requireSchoolPermission("staff.manage", { write: true });
  const l = await schoolLookups(school.schoolId);
  return (
    <>
      <PageHeader title="Add a staff member" description="Create the staff record. Teaching assignments and account linking come next." />
      <Card><CardBody><StaffForm departments={l.departments} /></CardBody></Card>
    </>
  );
}
