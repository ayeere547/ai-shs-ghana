"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { guardianUsers, notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const msg = (m: string) => (/permission denied/.test(m) ? "You don't have permission to do that." : /Reverse this|issued invoices|cancelled|valid amount|reason is required|between/.test(m) ? m.replace(/^[a-z]/, (c) => c.toUpperCase()) : friendlyDbError(m));

export async function generateInvoices(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchoolPermission("finance.manage", { write: true });
  const input = z
    .object({ termId: z.uuid("Choose a term"), classId: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()), dueDate: z.string().optional().transform((v) => v || null).pipe(z.iso.date().nullable()) })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_term_invoices", { p_term: input.data.termId, p_class: input.data.classId, p_due: input.data.dueDate });
  if (error) return { ok: false, message: msg(error.message) };
  revalidatePath("/school/finance", "layout");
  return { ok: true, message: data ? `${data} invoices issued.` : "No new invoices: every student already has one for this term, or no fees apply." };
}

export async function recordPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("finance.manage", { write: true });
  const input = z
    .object({ invoiceId: z.uuid(), amount: z.coerce.number().positive("Enter an amount"), method: z.enum(["cash", "mobile_money", "bank", "cheque", "card"]), reference: z.string().trim().max(120).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };
  const supabase = await createClient();
  const { data: paymentId, error } = await supabase.rpc("record_payment", { p_invoice: input.data.invoiceId, p_amount: input.data.amount, p_method: input.data.method, p_reference: input.data.reference || null });
  if (error) return { ok: false, message: msg(error.message) };
  const { data: inv } = await supabase.from("student_invoices").select("student_id").eq("id", input.data.invoiceId).single();
  if (inv) await notifyUsers({ schoolId: school.schoolId, userIds: await guardianUsers([inv.student_id]), category: "payments", title: "Payment received", body: `The school recorded a payment of GH₵${input.data.amount.toFixed(2)}. Your receipt is in the parent portal.`, link: "/parent" });
  revalidatePath(`/school/finance/invoices/${input.data.invoiceId}`);
  return { ok: true, message: `Payment recorded. Receipt ${paymentId ? "issued" : ""}.`.trim() };
}

export async function invoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSchoolPermission("finance.manage", { write: true });
  const input = z
    .object({ invoiceId: z.uuid(), op: z.enum(["add_line", "cancel", "reverse"]), description: z.string().trim().max(160).optional(), amount: z.coerce.number().optional(), reason: z.string().trim().max(300).optional(), paymentId: z.uuid().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: "Check the details." };
  const v = input.data;
  const supabase = await createClient();
  const { error } =
    v.op === "add_line"
      ? await supabase.rpc("add_invoice_line", { p_invoice: v.invoiceId, p_description: v.description ?? "", p_amount: v.amount ?? 0 })
      : v.op === "cancel"
        ? await supabase.rpc("cancel_invoice", { p_invoice: v.invoiceId, p_reason: v.reason ?? "" })
        : await supabase.rpc("reverse_payment", { p_payment: v.paymentId!, p_reason: v.reason ?? "" });
  if (error) return { ok: false, message: msg(error.message) };
  revalidatePath(`/school/finance/invoices/${v.invoiceId}`);
  return { ok: true, message: v.op === "add_line" ? "Invoice updated." : v.op === "cancel" ? "Invoice cancelled." : "Payment reversed." };
}
