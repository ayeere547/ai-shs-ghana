"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSchool } from "@/lib/auth/session";
import { classUsers, notifyUsers, schoolAudience } from "@/lib/notify";
import { uploadClassroomFile } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

async function requireTeacher() {
  const ctx = await requireSchool();
  const p = ctx.school.permissions;
  if (ctx.school.schoolStatus !== "active" || !(p.has("classroom.teach") || p.has("classroom.manage"))) redirect("/school?denied=1");
  return ctx;
}

const httpUrl = z.url({ protocol: /^https?$/, message: "Enter a full web address starting with https://" }).max(500);

const materialSchema = z
  .object({
    classId: z.uuid(),
    subjectId: z.uuid(),
    title: z.string().trim().min(2, "Enter a title").max(160),
    kind: z.enum(["note", "video", "document", "link"]),
    description: z.string().trim().max(2000).optional().transform((v) => v || null),
    body: z.string().max(50000).optional().transform((v) => v?.trim() || null),
    url: z.string().trim().optional().transform((v) => v || null).pipe(httpUrl.nullable()),
    publish: z.literal("on").optional(),
  })
  .refine((v) => v.kind !== "note" || v.body, { path: ["body"], message: "Write the notes" })
  .refine((v) => !["video", "link"].includes(v.kind) || v.url, { path: ["url"], message: "Add the link" });

export async function saveMaterial(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireTeacher();
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const upload = await uploadClassroomFile(supabase, `${school.schoolId}/materials`, formData.get("file"));
  if (upload.error) return { ok: false, errors: { file: [upload.error] }, values: formValues(formData) };
  if (v.kind === "document" && !upload.path) return { ok: false, errors: { file: ["Choose a file to upload"] }, values: formValues(formData) };

  const { error } = await supabase.from("learning_materials").insert({
    school_id: school.schoolId, class_id: v.classId, subject_id: v.subjectId, title: v.title, kind: v.kind,
    description: v.description, body: v.kind === "note" ? v.body : null, url: v.kind === "note" || v.kind === "document" ? null : v.url,
    file_path: upload.path ?? null, is_published: v.publish === "on",
  });
  if (error) {
    if (upload.path) await supabase.storage.from("classroom").remove([upload.path]);
    return { ok: false, message: /row-level security/.test(error.message) ? "You can only add materials for subjects you teach." : friendlyDbError(error.message), values: formValues(formData) };
  }
  revalidatePath("/school/classroom");
  return { ok: true, message: v.publish === "on" ? "Published to the class." : "Saved as a draft." };
}

export async function updateMaterial(formData: FormData) {
  const { school } = await requireTeacher();
  const input = z.object({ id: z.uuid(), op: z.enum(["publish", "unpublish", "delete"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  if (input.data.op === "delete") {
    const { data } = await supabase.from("learning_materials").delete().eq("id", input.data.id).eq("school_id", school.schoolId).select("file_path");
    const path = data?.[0]?.file_path;
    if (path) await supabase.storage.from("classroom").remove([path]);
  } else {
    await supabase.from("learning_materials").update({ is_published: input.data.op === "publish" }).eq("id", input.data.id).eq("school_id", school.schoolId);
  }
  revalidatePath("/school/classroom");
}

const announcementSchema = z.object({
  classId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  audience: z.enum(["all", "staff", "students"]).default("all"),
  title: z.string().trim().min(2, "Enter a title").max(160),
  body: z.string().trim().min(1, "Write the announcement").max(5000),
  isUrgent: z.literal("on").optional(),
});

/** Class announcements (teachers) or school-wide announcements (announcements.manage). */
export async function postAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchool();
  if (school.schoolStatus !== "active") return { ok: false, message: "The school isn't active." };
  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    school_id: school.schoolId, class_id: v.classId ?? null, subject_id: v.subjectId ?? null,
    audience: v.classId ? "all" : v.audience, title: v.title, body: v.body, is_urgent: v.isUrgent === "on",
  });
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You don't have permission to post this announcement." : friendlyDbError(error.message), values: formValues(formData) };
  if (!v.classId) await supabase.rpc("log_audit", { p_action: "announcement.posted", p_entity_type: "announcement", p_summary: v.title, p_school_id: school.schoolId });
  const { data: { user } } = await supabase.auth.getUser();
  const recipients = (v.classId ? await classUsers(v.classId) : await schoolAudience(school.schoolId, v.audience)).filter((u) => u !== user?.id);
  await notifyUsers({ schoolId: school.schoolId, userIds: recipients, category: "announcements", title: `${v.isUrgent === "on" ? "URGENT: " : ""}${v.title}`, body: v.body.slice(0, 280), link: v.classId ? "/student/classroom" : "/app/notifications" });
  revalidatePath("/school", "layout");
  revalidatePath("/student", "layout");
  return { ok: true, message: "Announcement posted." };
}

export async function deleteAnnouncement(formData: FormData) {
  const { school } = await requireSchool();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", id.data).eq("school_id", school.schoolId);
  revalidatePath("/school", "layout");
}

const postSchema = z.object({ classId: z.uuid(), subjectId: z.uuid(), parentId: z.uuid().optional(), body: z.string().trim().min(1, "Write something").max(2000) });

/** Discussion posts by teachers or students (RLS: students only in their own class). */
export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, school } = await requireSchool();
  const parsed = postSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("classroom_posts").insert({ school_id: school.schoolId, class_id: v.classId, subject_id: v.subjectId, parent_id: v.parentId ?? null, author_id: session.userId, body: v.body });
  if (error) return { ok: false, message: /row-level security/.test(error.message) ? "You can't post in this class." : friendlyDbError(error.message) };
  revalidatePath("/school/classroom");
  revalidatePath("/student/classroom");
  return { ok: true };
}

export async function moderatePost(formData: FormData) {
  await requireTeacher();
  const input = z.object({ id: z.uuid(), hide: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const supabase = await createClient();
  await supabase.rpc("moderate_post", { p_post: input.data.id, p_hidden: input.data.hide === "1" });
  revalidatePath("/school/classroom");
}

export async function deletePost(formData: FormData) {
  const { school } = await requireSchool();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("classroom_posts").delete().eq("id", id.data).eq("school_id", school.schoolId);
  revalidatePath("/school/classroom");
  revalidatePath("/student/classroom");
}
