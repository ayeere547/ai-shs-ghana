"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { uploadClassroomFile } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const resourceSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(200),
    author: z.string().trim().max(160).optional().transform((v) => v || null),
    description: z.string().trim().max(2000).optional().transform((v) => v || null),
    kind: z.enum(["ebook", "document", "video", "link", "past_questions"]),
    subjectId: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
    formLevel: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(6).nullable()),
    url: z.string().trim().optional().transform((v) => v || null).pipe(z.url({ protocol: /^https?$/, message: "Enter a full https:// address" }).max(500).nullable()),
    source: z.enum(["school", "licensed_official", "open_licence"]),
    licenceNote: z.string().trim().max(300).optional().transform((v) => v || null),
    audience: z.enum(["all", "staff"]),
  })
  .refine((v) => v.source !== "licensed_official" || v.licenceNote, { path: ["licenceNote"], message: "Describe the licence that allows you to share this" });

export async function addResource(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("library.manage", { write: true });
  const parsed = resourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const upload = await uploadClassroomFile(supabase, `${school.schoolId}/library`, formData.get("file"));
  if (upload.error) return { ok: false, errors: { file: [upload.error] }, values: formValues(formData) };
  if (!upload.path && !v.url) return { ok: false, errors: { url: ["Add a link or upload a file"] }, values: formValues(formData) };
  const { error } = await supabase.from("library_resources").insert({
    school_id: school.schoolId, title: v.title, author: v.author, description: v.description, kind: v.kind, subject_id: v.subjectId, form_level: v.formLevel,
    url: upload.path ? null : v.url, file_path: upload.path ?? null, source: v.source, licence_note: v.licenceNote, audience: v.audience,
  });
  if (error) {
    if (upload.path) await supabase.storage.from("classroom").remove([upload.path]);
    return { ok: false, message: friendlyDbError(error.message), values: formValues(formData) };
  }
  revalidatePath("/school/library");
  revalidatePath("/student/library");
  return { ok: true, message: "Added to the library." };
}

export async function deleteResource(formData: FormData) {
  const { school } = await requireSchoolPermission("library.manage", { write: true });
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("library_resources").delete().eq("id", id.data).eq("school_id", school.schoolId).select("file_path");
  if (data?.[0]?.file_path) await supabase.storage.from("classroom").remove([data[0].file_path]);
  revalidatePath("/school/library");
  revalidatePath("/student/library");
}
