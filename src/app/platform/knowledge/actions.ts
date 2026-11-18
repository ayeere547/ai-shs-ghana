"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ingestDocument, knowledgeSchema, reembedDocument } from "@/lib/ai/ingest";
import { requirePlatformPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation/auth";

export async function addPlatformKnowledge(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePlatformPermission("content.manage");
  const parsed = knowledgeSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "file")));
  if (!parsed.success) return fieldErrors(parsed.error);
  const res = await ingestDocument({ schoolId: null, userId: session.userId, meta: parsed.data, file: formData.get("file") });
  if ("error" in res) return { ok: false, message: res.error };
  await (await createClient()).rpc("log_audit", { p_action: "knowledge.platform_added", p_entity_type: "knowledge_document", p_summary: parsed.data.title });
  revalidatePath("/platform/knowledge");
  return { ok: true, message: `Added for every school (${res.chunks} sections).` };
}

export async function deletePlatformKnowledge(formData: FormData) {
  await requirePlatformPermission("content.manage");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("knowledge_documents").delete().eq("id", id.data).is("school_id", null);
  revalidatePath("/platform/knowledge");
}

export async function reembedPlatformKnowledge(formData: FormData) {
  const session = await requirePlatformPermission("content.manage");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await reembedDocument(id.data, null, session.userId);
  revalidatePath("/platform/knowledge");
}
