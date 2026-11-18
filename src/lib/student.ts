import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { getSchoolContext, type Membership, type Session } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type StudentContext = {
  session: Session;
  school: Membership;
  student: { id: string; first_name: string; last_name: string; student_number: string; class_id: string | null; className: string | null } | null;
};

/** The signed-in student's membership and linked student record (read under RLS: only their own). */
export const getStudentContext = cache(async (): Promise<StudentContext | null> => {
  const ctx = await getSchoolContext();
  if (!ctx) return null;
  const school = ctx.session.memberships.find((m) => m.role === "student" && m.schoolId === ctx.school.schoolId) ?? ctx.session.memberships.find((m) => m.role === "student");
  if (!school) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name, student_number, class_id, school_classes(name)")
    .eq("school_id", school.schoolId)
    .eq("user_id", ctx.session.userId)
    .eq("status", "active")
    .maybeSingle<{ id: string; first_name: string; last_name: string; student_number: string; class_id: string | null; school_classes: { name: string } | null }>();
  return { session: ctx.session, school, student: data ? { ...data, className: data.school_classes?.name ?? null } : null };
});

export async function requireStudent() {
  const ctx = await getStudentContext();
  if (!ctx) redirect("/app");
  return ctx;
}

/** For pages that need the linked record and a class. */
export async function requireEnrolledStudent() {
  const ctx = await requireStudent();
  if (!ctx.student?.class_id) redirect("/student");
  return ctx as StudentContext & { student: NonNullable<StudentContext["student"]> & { class_id: string } };
}

/** Subjects taught to the student's class (teacher assignments are visible to members). */
export async function classSubjects(classId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("teacher_assignments").select("subject_id, school_subjects(name)").eq("class_id", classId).returns<{ subject_id: string; school_subjects: { name: string } | null }[]>();
  return [...new Map((data ?? []).map((d) => [d.subject_id, d.school_subjects?.name ?? "Subject"])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
