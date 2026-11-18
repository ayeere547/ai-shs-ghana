import { Download } from "lucide-react";
import type { Metadata } from "next";

import { ImportWizard } from "@/components/students/forms";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { IMPORT_COLUMNS, IMPORT_TEMPLATE } from "@/lib/students/schema";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportPage() {
  await requireSchoolPermission("students.manage", { write: true });
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`;
  return (
    <>
      <PageHeader title="Import students" description="Upload a CSV file. We check every row first and show you errors and duplicates before anything is saved." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardBody>
            <ImportWizard />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="File format" />
          <CardBody className="space-y-3 text-sm">
            <a href={template} download="student-import-template.csv" className="inline-flex items-center gap-1.5 font-medium text-royal hover:underline">
              <Download className="h-4 w-4" /> Download template
            </a>
            <p className="text-muted-foreground">Required: <code>first_name</code>, <code>last_name</code>, <code>gender</code> (male/female or M/F).</p>
            <p className="text-muted-foreground">
              Optional: {IMPORT_COLUMNS.filter((c) => !["first_name", "last_name", "gender"].includes(c)).map((c) => <code key={c} className="mr-1">{c}</code>)}
            </p>
            <p className="text-muted-foreground">Class, programme and house must match names already set up in Academic setup. Dates use YYYY-MM-DD. Blank student numbers are generated.</p>
            <p className="text-muted-foreground">Duplicates are detected by student number, and by first name + surname + date of birth.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
