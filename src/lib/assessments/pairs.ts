import "server-only";

import type { Membership } from "@/lib/auth/session";
import { myTaughtClasses, schoolLookups } from "@/lib/school/lookups";

/** (class, subject) pairs the user may assess: every pair for managers, otherwise their teaching assignments. */
export async function assessablePairs(school: Membership, userId: string) {
  const l = await schoolLookups(school.schoolId);
  const name = (list: { value: string; label: string }[], id: string) => list.find((o) => o.value === id)?.label ?? "?";
  if (school.permissions.has("assessments.manage")) {
    return l.classes.flatMap((c) => l.subjects.map((s) => ({ classId: c.value, className: c.label, subjectId: s.value, subjectName: s.label })));
  }
  const { assignments } = await myTaughtClasses(school.schoolId, userId);
  return assignments.map((a) => ({ classId: a.class_id, className: name(l.classes, a.class_id), subjectId: a.subject_id, subjectName: name(l.subjects, a.subject_id) }));
}
