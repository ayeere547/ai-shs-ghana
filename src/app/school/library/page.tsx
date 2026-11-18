import type { Metadata } from "next";

import { ResourceAddForm } from "@/components/library/form";
import { LibraryBrowser } from "@/components/library/library";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { searchLibrary } from "@/lib/library";
import { schoolLookups } from "@/lib/school/lookups";

export const metadata: Metadata = { title: "Digital library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; subject?: string; kind?: string }> }) {
  const { school } = await requireSchoolPermission("academics.read");
  const params = await searchParams;
  const [l, { items, files }] = await Promise.all([schoolLookups(school.schoolId), searchLibrary(school.schoolId, params)]);
  const manage = school.permissions.has("library.manage") && school.schoolStatus === "active";
  return (
    <>
      <PageHeader title="Digital library" description="E-books, documents, videos and past-question collections for your school. Only share material you have the right to distribute." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <LibraryBrowser basePath="/school/library" items={items} files={files} subjects={l.subjects} params={params} manage={manage} />
        {manage && <Card className="self-start"><CardHeader title="Add a resource" /><CardBody><ResourceAddForm subjects={l.subjects} /></CardBody></Card>}
      </div>
    </>
  );
}
