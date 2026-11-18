import type { Metadata } from "next";
import Link from "next/link";

import { ResourceManager } from "@/components/school/resource-manager";
import { PageHeader } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { isResourceKey, RESOURCES, type ResourceKey } from "@/lib/school/resources";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Academic setup" };

const TABS: ResourceKey[] = ["years", "terms", "programmes", "classes", "departments", "subjects", "houses"];

export default async function AcademicsPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { school } = await requireSchoolPermission("academics.read");
  const { tab, edit } = await searchParams;
  const active: ResourceKey = isResourceKey(tab) ? tab : "years";
  const canManage = school.permissions.has("academics.manage") && school.schoolStatus === "active";

  return (
    <>
      <PageHeader title="Academic setup" description="Your school's academic calendar and structure. Every school configures its own." />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Academic setup sections">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/school/academics?tab=${t}`}
            aria-current={t === active ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", t === active ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {RESOURCES[t].plural}
          </Link>
        ))}
      </nav>
      <ResourceManager
        resource={active}
        schoolId={school.schoolId}
        canManage={canManage}
        editId={edit}
        hrefFor={(id) => `/school/academics?tab=${active}${id ? `&edit=${id}` : ""}`}
      />
    </>
  );
}
