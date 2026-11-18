import type { Metadata } from "next";

import { KnowledgeForm } from "@/components/knowledge/knowledge";
import { KnowledgeList, type KnowledgeDoc } from "@/components/knowledge/list";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { isAiConfigured } from "@/lib/ai/config";
import { requireSchoolPermission } from "@/lib/auth/session";
import { schoolLookups } from "@/lib/school/lookups";
import { createClient } from "@/lib/supabase/server";

import { addSchoolKnowledge, deleteSchoolKnowledge, reembedSchoolKnowledge } from "./actions";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KnowledgePage() {
  const { school } = await requireSchoolPermission("academics.read");
  const supabase = await createClient();
  const [{ data }, l] = await Promise.all([
    supabase.from("knowledge_documents").select("id, title, subject_name, form_level, source_type, is_official, status, chunk_count, embedded, created_at, school_id").or(`school_id.eq.${school.schoolId},school_id.is.null`).order("created_at", { ascending: false }).returns<KnowledgeDoc[]>(),
    schoolLookups(school.schoolId),
  ]);
  const manage = school.permissions.has("knowledge.manage") && school.schoolStatus === "active";
  return (
    <>
      <PageHeader title="Knowledge base" description="The material the AI tutor and teaching assistants draw on and cite. Your school's documents are private to your school; platform-wide documents are shared with every school." />
      {!isAiConfigured() && <Alert tone="info" className="mb-4">AI isn&apos;t configured on this server yet. Documents are still indexed for keyword search and will work with smart search once it is.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <KnowledgeList docs={data ?? []} onDelete={deleteSchoolKnowledge} onReembed={reembedSchoolKnowledge} manage={(d) => manage && d.school_id === school.schoolId} />
        {manage && <Card className="self-start"><CardHeader title="Add a document" /><CardBody><KnowledgeForm action={addSchoolKnowledge} subjects={l.subjects.map((s) => s.label)} /></CardBody></Card>}
      </div>
    </>
  );
}
