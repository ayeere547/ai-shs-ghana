"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { guardianUsers, notifyUsers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

/**
 * One message in a child's family–school thread. Whether it is "from family" is decided from the
 * signed-in user's verified guardianship; RLS re-checks both sides.
 */
export async function sendFamilyMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in again." };
  const input = z.object({ studentId: z.uuid(), body: z.string().trim().min(1, "Write a message").max(3000) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };

  const supabase = await createClient();
  const { data: kids } = await supabase.rpc("guardian_children");
  const fromFamily = ((kids ?? []) as { student_id: string }[]).some((k) => k.student_id === input.data.studentId);
  const { data: student } = await supabase.from("students").select("school_id, class_id, first_name").eq("id", input.data.studentId).maybeSingle();
  if (!student) return { ok: false, message: "You can't message about this student." };

  const { error } = await supabase.from("family_messages").insert({ school_id: student.school_id, student_id: input.data.studentId, from_family: fromFamily, body: input.data.body });
  if (error) return { ok: false, message: "You can't message about this student." };

  // Notify the other side.
  let recipients: string[] = [];
  if (fromFamily) {
    try {
      const admin = createAdminClient();
      const { data: teachers } = await admin.from("teacher_assignments").select("staff!inner(user_id)").eq("class_id", student.class_id ?? "").returns<{ staff: { user_id: string | null } }[]>();
      recipients = (teachers ?? []).map((t) => t.staff.user_id).filter(Boolean) as string[];
    } catch {
      recipients = [];
    }
  } else {
    recipients = await guardianUsers([input.data.studentId]);
  }
  await notifyUsers({
    schoolId: student.school_id,
    userIds: recipients.filter((u) => u !== session.userId),
    category: "messages",
    title: fromFamily ? `Message from ${student.first_name}'s family` : `Message from ${student.first_name}'s school`,
    body: input.data.body.slice(0, 200),
    link: fromFamily ? `/school/messages?student=${input.data.studentId}` : `/parent/child/${input.data.studentId}#messages`,
  });
  revalidatePath("/parent", "layout");
  revalidatePath("/school/messages");
  return { ok: true };
}
