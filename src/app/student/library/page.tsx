import type { Metadata } from "next";

import { LibraryBrowser } from "@/components/library/library";
import { PageHeader } from "@/components/ui/primitives";
import { searchLibrary } from "@/lib/library";
import { schoolLookups } from "@/lib/school/lookups";
import { requireStudent } from "@/lib/student";

export const metadata: Metadata = { title: "Library" };

export default async function StudentLibrary({ searchParams }: { searchParams: Promise<{ q?: string; subject?: string; kind?: string }> }) {
  const { school } = await requireStudent();
  const params = await searchParams;
  const [l, { items, files }] = await Promise.all([schoolLookups(school.schoolId), searchLibrary(school.schoolId, params)]);
  return (
    <>
      <PageHeader title="Library" description="Books, documents, videos and past-question collections shared by your school." />
      <LibraryBrowser basePath="/student/library" items={items} files={files} subjects={l.subjects} params={params} />
    </>
  );
}
