"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ingestDocument, knowledgeSchema, reembedDocument } from "@/lib/ai/ingest";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation/auth";

export async function addSchoolKnowledge(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, school } = await requireSchoolPermission("knowledge.manage", { write: true });
  const parsed = knowledgeSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "file")));
  if (!parsed.success) return fieldErrors(parsed.error);
  const res = await ingestDocument({ schoolId: school.schoolId, userId: session.userId, meta: parsed.data, file: formData.get("file") });
  if ("error" in res) return { ok: false, message: res.error };
  revalidatePath("/school/knowledge");
  return { ok: true, message: `Added (${res.chunks} sections${res.embedded ? ", smart search ready" : ", keyword search — smart search when AI is configured"}).` };
}

export async function deleteSchoolKnowledge(formData: FormData) {
  const { school } = await requireSchoolPermission("knowledge.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("knowledge_documents").delete().eq("id", id.data).eq("school_id", school.schoolId);
  revalidatePath("/school/knowledge");
}

export async function reembedSchoolKnowledge(formData: FormData) {
  const { session, school } = await requireSchoolPermission("knowledge.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await reembedDocument(id.data, school.schoolId, session.userId);
  revalidatePath("/school/knowledge");
}
