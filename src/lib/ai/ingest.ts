import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { embed } from "./client";
import { aiConfig, isAiConfigured } from "./config";
import { chunkText, extractText } from "./rag";
import { logUsage } from "./service";

export const MAX_KNOWLEDGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHUNKS = 400;

export const knowledgeSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(200),
    subjectName: z.string().trim().max(80).optional().transform((v) => v || null),
    formLevel: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(6).nullable()),
    sourceType: z.enum(["curriculum", "teacher_notes", "textbook", "past_questions", "other"]),
    isOfficial: z.literal("on").optional(),
    licenceNote: z.string().trim().max(300).optional().transform((v) => v || null),
    text: z.string().max(400_000).optional(),
  })
  .refine((v) => !v.isOfficial || v.licenceNote, { path: ["licenceNote"], message: "Say where this official document comes from and that you may use it" });

/**
 * Adds a document to a school's (or, with schoolId null, the platform's) knowledge base:
 * extract → chunk → embed (when AI is configured) → store. Runs as the signed-in user, so RLS
 * decides whether they may write to that knowledge base.
 */
export async function ingestDocument(opts: { schoolId: string | null; userId: string; meta: z.infer<typeof knowledgeSchema>; file: FormDataEntryValue | null }) {
  let text = opts.meta.text?.trim() ?? "";
  if (opts.file instanceof File && opts.file.size > 0) {
    if (opts.file.size > MAX_KNOWLEDGE_BYTES) return { error: "Files must be 10 MB or smaller." };
    if (!/\.(pdf|txt|md)$/i.test(opts.file.name)) return { error: "Upload a PDF, .txt or .md file." };
    try {
      text = await extractText(opts.file);
    } catch {
      return { error: "Couldn't read that file. If it's a scanned PDF, it needs text (not just images)." };
    }
  }
  const chunks = chunkText(text);
  if (!chunks.length) return { error: "No readable text found. Paste the text or upload a text-based PDF." };
  if (chunks.length > MAX_CHUNKS) return { error: `That document is too long (${chunks.length} sections). Split it into smaller documents.` };

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("knowledge_documents")
    .insert({
      school_id: opts.schoolId, title: opts.meta.title, subject_name: opts.meta.subjectName, form_level: opts.meta.formLevel, source_type: opts.meta.sourceType,
      is_official: opts.meta.isOfficial === "on", licence_note: opts.meta.licenceNote, status: "processing",
    })
    .select("id")
    .single();
  if (error || !doc) return { error: /row-level security/.test(error?.message ?? "") ? "You don't have permission to add to this knowledge base." : "Couldn't save the document." };

  const embeddings = await embedChunks(chunks.map((c) => `${c.heading ?? ""}\n${c.content}`), opts.schoolId, opts.userId);
  const { error: chunkError } = await supabase.from("knowledge_chunks").insert(
    chunks.map((c, i) => ({ document_id: doc.id, school_id: opts.schoolId, chunk_index: c.index, heading: c.heading, content: c.content, embedding: embeddings ? `[${embeddings[i].join(",")}]` : null })),
  );
  await supabase.from("knowledge_documents").update({ status: chunkError ? "failed" : "ready", chunk_count: chunks.length, embedded: Boolean(embeddings) && !chunkError }).eq("id", doc.id);
  if (chunkError) return { error: "The document was saved but couldn't be indexed. Delete it and try again." };
  return { ok: true as const, chunks: chunks.length, embedded: Boolean(embeddings) };
}

/** Embeds texts in batches; returns null (keyword search only) if AI isn't configured or fails. */
async function embedChunks(texts: string[], schoolId: string | null, userId: string): Promise<number[][] | null> {
  if (!isAiConfigured()) return null;
  const cfg = aiConfig();
  const out: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += 64) {
      const res = await embed(texts.slice(i, i + 64), cfg.models.embedding, cfg.embeddingDimensions);
      out.push(...res.vectors);
      if (schoolId) await logUsage({ schoolId, userId, feature: "embedding", model: cfg.models.embedding, inputTokens: res.usage.inputTokens, kind: "embedding" });
    }
    return out;
  } catch {
    return null;
  }
}

/** Adds embeddings to an already-indexed document (e.g. after AI is configured). */
export async function reembedDocument(documentId: string, schoolId: string | null, userId: string) {
  const supabase = await createClient();
  const { data: chunks } = await supabase.from("knowledge_chunks").select("id, document_id, school_id, chunk_index, heading, content").eq("document_id", documentId).order("chunk_index");
  if (!chunks?.length) return { error: "Nothing to index." };
  const vectors = await embedChunks(chunks.map((c) => `${c.heading ?? ""}\n${c.content}`), schoolId, userId);
  if (!vectors) return { error: isAiConfigured() ? "Indexing failed. Try again later." : "AI isn't configured, so only keyword search is available." };
  const { error } = await supabase.from("knowledge_chunks").upsert(chunks.map((c, i) => ({ ...c, embedding: `[${vectors[i].join(",")}]` })), { onConflict: "id" });
  if (error) return { error: "Couldn't save the index." };
  await supabase.from("knowledge_documents").update({ embedded: true }).eq("id", documentId);
  return { ok: true as const };
}
