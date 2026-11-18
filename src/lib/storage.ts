import "server-only";

import { randomUUID } from "node:crypto";

import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export const CLASSROOM_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
export const MAX_CLASSROOM_BYTES = 10 * 1024 * 1024;

/** Safe object name: folder prefix + random id + sanitised original name. */
export function objectName(prefix: string, file: File) {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `${prefix}/${randomUUID()}-${base}.${CLASSROOM_TYPES[file.type]}`;
}

/**
 * Uploads to the private classroom bucket with the user's own session, so storage RLS decides
 * whether the path is allowed. Returns the stored path or a user-facing error.
 */
export async function uploadClassroomFile(supabase: Client, prefix: string, file: FormDataEntryValue | null): Promise<{ path?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  if (!CLASSROOM_TYPES[file.type]) return { error: "Upload a PDF, image, Word, PowerPoint, Excel or text file." };
  if (file.size > MAX_CLASSROOM_BYTES) return { error: "Files must be 10 MB or smaller." };
  const path = objectName(prefix, file);
  const { error } = await supabase.storage.from("classroom").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "The file could not be uploaded. Please try again." };
  return { path };
}

/** Short-lived download links for objects the user may read (RLS on storage.objects decides). */
export async function signedUrls(supabase: Client, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await supabase.storage.from("classroom").createSignedUrls(unique, 60 * 30);
  const out = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

export const fileLabel = (path: string) => path.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
