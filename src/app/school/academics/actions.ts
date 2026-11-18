"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { isResourceKey, readResourceForm, RESOURCES, resourceSchema } from "@/lib/school/resources";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, type FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

/** Create or update a structure record. school_id always comes from the verified school context, never the form. */
export async function saveResource(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("academics.manage", { write: true });
  const key = formData.get("resource");
  if (!isResourceKey(key)) return { ok: false, message: "Unknown record type." };
  const def = RESOURCES[key];
  const id = formData.get("id") ? z.uuid().safeParse(formData.get("id")) : null;
  if (id && !id.success) return { ok: false, message: "Invalid record." };

  const parsed = resourceSchema(def).safeParse(readResourceForm(def, formData));
  if (!parsed.success) return { ...fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createClient();
  const data = parsed.data;
  // Clear the previous "current" flag first so the one-current-per-school index is satisfied.
  if (def.exclusiveFlag && data[def.exclusiveFlag] === true) {
    let clear = supabase.from(def.table).update({ [def.exclusiveFlag]: false }).eq("school_id", school.schoolId).eq(def.exclusiveFlag, true);
    if (id?.data) clear = clear.neq("id", id.data);
    await clear;
  }

  const { error } = id?.data
    ? await supabase.from(def.table).update(data).eq("id", id.data).eq("school_id", school.schoolId)
    : await supabase.from(def.table).insert({ ...data, school_id: school.schoolId });
  if (error) return { ok: false, message: friendlyDbError(error.message), values: formValues(formData) };

  await supabase.rpc("log_audit", {
    p_action: `academics.${key}.${id?.data ? "updated" : "created"}`,
    p_entity_type: def.table,
    p_entity_id: id?.data ?? null,
    p_summary: `${id?.data ? "Updated" : "Added"} ${def.singular}: ${String(data.name ?? "")}`,
    p_school_id: school.schoolId,
  });
  revalidatePath("/school", "layout");
  return { ok: true, message: `${def.singular[0].toUpperCase()}${def.singular.slice(1)} ${id?.data ? "updated" : "added"}.` };
}

export async function deleteResource(formData: FormData) {
  const { school } = await requireSchoolPermission("academics.manage", { write: true });
  const key = formData.get("resource");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!isResourceKey(key) || !id.success) return;
  const def = RESOURCES[key];
  const supabase = await createClient();
  const { data } = await supabase.from(def.table).delete().eq("id", id.data).eq("school_id", school.schoolId).select("name");
  if (data?.length) {
    await supabase.rpc("log_audit", {
      p_action: `academics.${key}.deleted`,
      p_entity_type: def.table,
      p_entity_id: id.data,
      p_summary: `Removed ${def.singular}: ${data[0].name}`,
      p_school_id: school.schoolId,
    });
  }
  revalidatePath("/school", "layout");
}
