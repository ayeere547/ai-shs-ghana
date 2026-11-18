/**
 * Timetable generator. Places each class's required lessons (from teacher assignments) into the
 * school's teaching periods without double-booking a class or a teacher, spreading a subject
 * across different days where possible. Pure and deterministic, so it is unit-tested and the
 * database's unique constraints remain the final guard.
 */
export type Demand = { classId: string; subjectId: string; staffId: string | null; periodsPerWeek: number };
export type Slot = { classId: string; subjectId: string; staffId: string | null; day: number; periodId: string };
export type Unplaced = Demand & { missing: number };

export function generateTimetable({ days, periodIds, demands, fixed = [] }: { days: number[]; periodIds: string[]; demands: Demand[]; fixed?: Slot[] }) {
  const key = (a: string, d: number, p: string) => `${a}|${d}|${p}`;
  const classBusy = new Set<string>();
  const teacherBusy = new Set<string>();
  const subjectDay = new Map<string, number>(); // class|subject|day -> lessons that day
  const slots: Slot[] = [];

  const occupy = (s: Slot) => {
    classBusy.add(key(s.classId, s.day, s.periodId));
    if (s.staffId) teacherBusy.add(key(s.staffId, s.day, s.periodId));
    const sd = `${s.classId}|${s.subjectId}|${s.day}`;
    subjectDay.set(sd, (subjectDay.get(sd) ?? 0) + 1);
  };
  for (const s of fixed) occupy(s);

  // Hardest first: most lessons, then teachers with the heaviest load.
  const load = new Map<string, number>();
  for (const d of demands) if (d.staffId) load.set(d.staffId, (load.get(d.staffId) ?? 0) + d.periodsPerWeek);
  const ordered = [...demands].sort(
    (a, b) => b.periodsPerWeek - a.periodsPerWeek || (load.get(b.staffId ?? "") ?? 0) - (load.get(a.staffId ?? "") ?? 0) || `${a.classId}${a.subjectId}`.localeCompare(`${b.classId}${b.subjectId}`),
  );

  const unplaced: Unplaced[] = [];
  for (const d of ordered) {
    let remaining = d.periodsPerWeek;
    // Pass 1 allows one lesson of the subject per day; later passes allow more if needed.
    for (let maxPerDay = 1; remaining > 0 && maxPerDay <= periodIds.length; maxPerDay++) {
      for (let pi = 0; remaining > 0 && pi < periodIds.length; pi++) {
        for (const day of days) {
          if (remaining === 0) break;
          // Rotate the period by subject so the same subject doesn't always sit in the same period.
          const periodId = periodIds[(pi + hash(d.subjectId)) % periodIds.length];
          const sd = `${d.classId}|${d.subjectId}|${day}`;
          if ((subjectDay.get(sd) ?? 0) >= maxPerDay) continue;
          if (classBusy.has(key(d.classId, day, periodId))) continue;
          if (d.staffId && teacherBusy.has(key(d.staffId, day, periodId))) continue;
          const slot = { classId: d.classId, subjectId: d.subjectId, staffId: d.staffId, day, periodId };
          occupy(slot);
          slots.push(slot);
          remaining--;
        }
      }
    }
    if (remaining > 0) unplaced.push({ ...d, missing: remaining });
  }
  return { slots, unplaced };
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Finds clashes in a set of slots (used to explain manual-edit failures and to verify generated output). */
export function findClashes(slots: (Slot & { room?: string | null })[]) {
  const seen = new Map<string, Slot>();
  const clashes: { kind: "class" | "teacher" | "room"; a: Slot; b: Slot }[] = [];
  for (const s of slots) {
    const checks: ["class" | "teacher" | "room", string | null | undefined][] = [
      ["class", s.classId],
      ["teacher", s.staffId],
      ["room", s.room],
    ];
    for (const [kind, who] of checks) {
      if (!who) continue;
      const k = `${kind}|${who}|${s.day}|${s.periodId}`;
      const prev = seen.get(k);
      if (prev) clashes.push({ kind, a: prev, b: s });
      else seen.set(k, s);
    }
  }
  return clashes;
}

export const DAY_NAMES: Record<number, string> = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" };
