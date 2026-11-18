"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSchoolPermission } from "@/lib/auth/session";
import { staffName } from "@/lib/staff/schema";
import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES, generateTimetable } from "@/lib/timetable/generate";
import type { FormState } from "@/lib/validation/auth";
import { friendlyDbError } from "@/lib/validation/school";

const slotSchema = z.object({
  termId: z.uuid(),
  classId: z.uuid(),
  day: z.coerce.number().int().min(1).max(7),
  periodId: z.uuid(),
  subjectId: z.uuid("Choose a subject"),
  room: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null),
});

/** Saves one lesson. Clashes are rejected by the database's unique constraints and explained here. */
export async function saveSlot(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireSchoolPermission("timetable.manage", { write: true });
  const parsed = slotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: assignment } = await supabase.from("teacher_assignments").select("staff_id").eq("class_id", v.classId).eq("subject_id", v.subjectId).maybeSingle();
  const row = { school_id: school.schoolId, term_id: v.termId, class_id: v.classId, day_of_week: v.day, period_id: v.periodId, subject_id: v.subjectId, staff_id: assignment?.staff_id ?? null, room: v.room };
  const { error } = await supabase.from("timetable_slots").upsert(row, { onConflict: "term_id,class_id,day_of_week,period_id" });
  if (error) {
    if (/timetable_teacher_clash/.test(error.message) && assignment?.staff_id) {
      const { data: other } = await supabase
        .from("timetable_slots")
        .select("school_classes(name), staff(title, first_name, last_name)")
        .eq("term_id", v.termId).eq("staff_id", assignment.staff_id).eq("day_of_week", v.day).eq("period_id", v.periodId)
        .maybeSingle<{ school_classes: { name: string } | null; staff: { title: string | null; first_name: string; last_name: string } | null }>();
      return { ok: false, message: `Teacher clash: ${other?.staff ? staffName(other.staff) : "this teacher"} already teaches ${other?.school_classes?.name ?? "another class"} on ${DAY_NAMES[v.day]} in this period.` };
    }
    if (/timetable_room_clash/.test(error.message)) return { ok: false, message: `Room clash: ${v.room} is already in use on ${DAY_NAMES[v.day]} in this period.` };
    return { ok: false, message: friendlyDbError(error.message) };
  }
  revalidatePath("/school/timetable");
  return { ok: true, message: assignment ? "Lesson saved." : "Lesson saved without a teacher — assign one to this class and subject under Staff." };
}

export async function clearSlot(formData: FormData) {
  const { school } = await requireSchoolPermission("timetable.manage", { write: true });
  const v = slotSchema.pick({ termId: true, classId: true, day: true, periodId: true }).safeParse(Object.fromEntries(formData));
  if (!v.success) return;
  const supabase = await createClient();
  await supabase.from("timetable_slots").delete().eq("school_id", school.schoolId).eq("term_id", v.data.termId).eq("class_id", v.data.classId).eq("day_of_week", v.data.day).eq("period_id", v.data.periodId);
  revalidatePath("/school/timetable");
}

export type GenerateState = FormState & { placed?: number; unplaced?: string[] };

/** Rebuilds the whole term's timetable from teaching assignments. */
export async function generate(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const { school } = await requireSchoolPermission("timetable.manage", { write: true });
  const input = z.object({ termId: z.uuid(), confirm: z.literal("on", { message: "Confirm that the current timetable will be replaced" }) }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, message: input.error.issues[0].message };

  const supabase = await createClient();
  const [{ data: periods }, { data: assignments }, { data: settings }, { data: classes }, { data: subjects }] = await Promise.all([
    supabase.from("timetable_periods").select("id").eq("school_id", school.schoolId).eq("is_break", false).order("starts_at"),
    supabase.from("teacher_assignments").select("class_id, subject_id, staff_id, periods_per_week").eq("school_id", school.schoolId),
    supabase.from("school_settings").select("school_days").eq("school_id", school.schoolId).single(),
    supabase.from("school_classes").select("id, name").eq("school_id", school.schoolId),
    supabase.from("school_subjects").select("id, name").eq("school_id", school.schoolId),
  ]);
  if (!periods?.length) return { ok: false, message: "Set up the school day's periods first (Academic setup → Periods)." };
  if (!assignments?.length) return { ok: false, message: "Add teaching assignments (Staff → a teacher → Teaching assignments) first." };

  const { slots, unplaced } = generateTimetable({
    days: ((settings?.school_days as number[]) ?? [1, 2, 3, 4, 5]).slice().sort(),
    periodIds: periods.map((p) => p.id),
    demands: assignments.filter((a) => a.periods_per_week > 0).map((a) => ({ classId: a.class_id, subjectId: a.subject_id, staffId: a.staff_id, periodsPerWeek: a.periods_per_week })),
  });
  const { error } = await supabase.rpc("replace_timetable", {
    p_school: school.schoolId,
    p_term: input.data.termId,
    p_classes: [...new Set(assignments.map((a) => a.class_id))],
    p_slots: slots.map((s) => ({ class_id: s.classId, subject_id: s.subjectId, staff_id: s.staffId, day_of_week: s.day, period_id: s.periodId })),
  });
  if (error) return { ok: false, message: friendlyDbError(error.message) };

  const name = (list: { id: string; name: string }[] | null, id: string) => list?.find((x) => x.id === id)?.name ?? "?";
  revalidatePath("/school/timetable");
  return {
    ok: true,
    placed: slots.length,
    unplaced: unplaced.map((u) => `${name(classes, u.classId)} · ${name(subjects, u.subjectId)}: ${u.missing} lesson${u.missing === 1 ? "" : "s"} could not be placed`),
    message: `${slots.length} lessons scheduled without any class or teacher clashes.`,
  };
}
