import "server-only";

import type { Membership } from "@/lib/auth/session";
import { myTaughtClasses, schoolLookups } from "@/lib/school/lookups";

export type Pair = { key: string; classId: string; className: string; subjectId: string; subjectName: string };

/**
 * The class × subject pairs the user teaches (classroom.teach), or every pair for classroom
 * managers. The database applies the same rule via can_teach(); this only shapes the UI.
 */
export async function teachingPairs(school: Membership, userId: string): Promise<Pair[]> {
  const l = await schoolLookups(school.schoolId);
  const name = (list: { value: string; label: string }[], id: string) => list.find((o) => o.value === id)?.label ?? "?";
  const make = (classId: string, subjectId: string): Pair => ({ key: `${classId}:${subjectId}`, classId, className: name(l.classes, classId), subjectId, subjectName: name(l.subjects, subjectId) });
  if (school.permissions.has("classroom.manage")) return l.classes.flatMap((c) => l.subjects.map((s) => make(c.value, s.value)));
  if (!school.permissions.has("classroom.teach")) return [];
  const { assignments } = await myTaughtClasses(school.schoolId, userId);
  return assignments.map((a) => make(a.class_id, a.subject_id)).sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName));
}

export const pickPair = (pairs: Pair[], wanted?: string) => pairs.find((p) => p.key === wanted) ?? pairs[0];

export const MATERIAL_KINDS = [
  { value: "note", label: "Notes" },
  { value: "video", label: "Video lesson (link)" },
  { value: "document", label: "Document (upload)" },
  { value: "link", label: "Web link" },
] as const;
