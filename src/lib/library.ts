import "server-only";

import type { Resource } from "@/components/library/library";
import { searchTerm } from "@/lib/schools";
import { signedUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** Library search under the viewer's RLS (students never get staff-only items). */
export async function searchLibrary(schoolId: string, params: { q?: string; subject?: string; kind?: string }) {
  const supabase = await createClient();
  let query = supabase.from("library_resources").select("id, title, author, description, kind, subject_id, form_level, url, file_path, source, licence_note, audience").eq("school_id", schoolId);
  const q = searchTerm(params.q);
  if (q) query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
  if (params.subject && /^[0-9a-f-]{36}$/i.test(params.subject)) query = query.eq("subject_id", params.subject);
  if (params.kind && /^[a-z_]{2,20}$/.test(params.kind)) query = query.eq("kind", params.kind);
  const { data } = await query.order("title").limit(200).returns<Resource[]>();
  const files = await signedUrls(supabase, (data ?? []).map((r) => r.file_path));
  return { items: data ?? [], files };
}
