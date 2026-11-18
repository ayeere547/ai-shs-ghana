"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { friendlyError } from "@/lib/billing";
import { TICKET_CATEGORIES } from "@/lib/support";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

const categories = TICKET_CATEGORIES.map((c) => c.value) as [string, ...string[]];

/** Opens a ticket. The school must be one of the user's verified memberships (checked again in the database). */
export async function openTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const v = z.object({
    schoolId: z.union([z.uuid(), z.literal("")]),
    subject: z.string().trim().min(3, "Add a short subject").max(160),
    category: z.enum(categories),
    priority: z.enum(["low", "normal", "high"]),
    body: z.string().trim().min(10, "Describe the problem in a sentence or two").max(5000),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const schoolId = v.data.schoolId || null;
  if (schoolId && !session.memberships.some((m) => m.schoolId === schoolId)) return { ok: false, message: "Choose one of your schools." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_support_ticket", { p_school: schoolId, p_subject: v.data.subject, p_category: v.data.category, p_priority: v.data.priority, p_body: v.data.body });
  if (error || !data) return { ok: false, message: friendlyError(error?.message, "Couldn't send your request. Please try again.") };
  redirect(`/app/support/${data}`);
}

export async function replyTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const v = z.object({ ticketId: z.uuid(), body: z.string().trim().min(1, "Write a reply").max(5000), internal: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!v.success) return { ok: false, message: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_support_ticket", { p_ticket: v.data.ticketId, p_body: v.data.body, p_internal: v.data.internal === "on" });
  if (error) return { ok: false, message: friendlyError(error.message, "Couldn't send the reply.") };
  revalidatePath(`/app/support/${v.data.ticketId}`);
  revalidatePath(`/platform/support/${v.data.ticketId}`);
  return { ok: true };
}

/** Requesters may close/resolve their own ticket; support staff can also change priority and assignee (enforced in the database). */
export async function updateTicket(formData: FormData) {
  await requireSession();
  const v = z.object({
    ticketId: z.uuid(),
    status: z.enum(["open", "in_progress", "waiting_on_requester", "resolved", "closed", ""]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent", ""]).optional(),
    assignee: z.union([z.uuid(), z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const supabase = await createClient();
  await supabase.rpc("update_support_ticket", { p_ticket: v.data.ticketId, p_status: v.data.status || null, p_priority: v.data.priority || null, p_assignee: v.data.assignee || null });
  revalidatePath(`/app/support/${v.data.ticketId}`);
  revalidatePath(`/platform/support/${v.data.ticketId}`);
  revalidatePath("/platform/support");
}

/** Act 843: asks the platform team to delete the account. Staff verify identity and the schools' record-keeping duties first. */
export async function requestAccountDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const reason = z.string().trim().max(1000).safeParse(formData.get("reason") ?? "");
  if (formData.get("confirm") !== "on") return { ok: false, message: "Tick the box to confirm." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_support_ticket", {
    p_school: null, p_subject: "Request to delete my account", p_category: "data_protection", p_priority: "normal",
    p_body: `Please delete my AI SHS Ghana account and personal data.${reason.success && reason.data ? `\n\nReason: ${reason.data}` : ""}`,
  });
  if (error || !data) return { ok: false, message: friendlyError(error?.message, "Couldn't send the request. Please try again.") };
  redirect(`/app/support/${data}`);
}
