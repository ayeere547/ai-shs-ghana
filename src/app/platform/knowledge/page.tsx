import type { Metadata } from "next";

import { KnowledgeForm } from "@/components/knowledge/knowledge";
import { KnowledgeList, type KnowledgeDoc } from "@/components/knowledge/list";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { addPlatformKnowledge, deletePlatformKnowledge, reembedPlatformKnowledge } from "./actions";

export const metadata: Metadata = { title: "Shared knowledge" };

const CORE = ["English Language", "Core Mathematics", "Integrated Science", "Social Studies", "Elective Mathematics", "Biology", "Chemistry", "Physics", "Economics", "Geography", "Government", "History", "Literature in English", "Accounting", "Business Management", "Financial Accounting", "ICT"];

export default async function PlatformKnowledge() {
  await requirePlatformPermission("content.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("knowledge_documents").select("id, title, subject_name, form_level, source_type, is_official, status, chunk_count, embedded, created_at, school_id").is("school_id", null).order("created_at", { ascending: false }).returns<KnowledgeDoc[]>();
  return (
    <>
      <PageHeader title="Shared knowledge" description="Approved, properly licensed curriculum material available to every school's AI tutor. Match subject names to the names schools use (e.g. Core Mathematics)." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <KnowledgeList docs={data ?? []} onDelete={deletePlatformKnowledge} onReembed={reembedPlatformKnowledge} manage={() => true} title="Platform-wide documents" />
        <Card className="self-start"><CardHeader title="Add a document" /><CardBody><KnowledgeForm action={addPlatformKnowledge} subjects={CORE} /></CardBody></Card>
      </div>
    </>
  );
}
