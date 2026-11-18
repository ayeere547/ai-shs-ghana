/**
 * Term results. For each student and subject: total = Σ(score/max × weight) / Σ(weight of assessments
 * set) × 100, rounded to one decimal. Missing scores count as 0 only when `missingAsZero` is set;
 * otherwise the assessment is excluded for that student and the subject is flagged incomplete.
 * Grades come from the school's own configured bands — no national scheme is assumed.
 */
export type Assessment = { id: string; subject_id: string; max_score: number; weight: number };
export type Score = { assessment_id: string; student_id: string; score: number | null };
export type Band = { grade: string; min_score: number; max_score: number; remark: string | null };

export type SubjectResult = { total: number | null; grade: string | null; remark: string | null; incomplete: boolean };
export type StudentResult = { studentId: string; subjects: Record<string, SubjectResult>; average: number | null; position: number | null };

export function gradeFor(total: number, bands: Band[]) {
  const band = [...bands].sort((a, b) => b.min_score - a.min_score).find((b) => total >= Number(b.min_score) && total <= Number(b.max_score) + 0.0001);
  return band ? { grade: band.grade, remark: band.remark } : { grade: null, remark: null };
}

export function computeResults({ studentIds, assessments, scores, bands, missingAsZero = false }: { studentIds: string[]; assessments: Assessment[]; scores: Score[]; bands: Band[]; missingAsZero?: boolean }): StudentResult[] {
  const byStudent = new Map<string, Map<string, number | null>>();
  for (const s of scores) {
    if (!byStudent.has(s.student_id)) byStudent.set(s.student_id, new Map());
    byStudent.get(s.student_id)!.set(s.assessment_id, s.score == null ? null : Number(s.score));
  }
  const subjects = [...new Set(assessments.map((a) => a.subject_id))];

  const results: StudentResult[] = studentIds.map((studentId) => {
    const mine = byStudent.get(studentId) ?? new Map<string, number | null>();
    const out: Record<string, SubjectResult> = {};
    for (const subject of subjects) {
      let weighted = 0;
      let weights = 0;
      let incomplete = false;
      for (const a of assessments.filter((x) => x.subject_id === subject)) {
        const score = mine.get(a.id);
        if (score == null) {
          incomplete = true;
          if (!missingAsZero) continue;
        }
        weighted += ((score ?? 0) / Number(a.max_score)) * Number(a.weight);
        weights += Number(a.weight);
      }
      const total = weights > 0 ? Math.round((weighted / weights) * 1000) / 10 : null;
      out[subject] = { total, ...(total == null ? { grade: null, remark: null } : gradeFor(total, bands)), incomplete };
    }
    const totals = Object.values(out).map((r) => r.total).filter((t): t is number => t != null);
    const average = totals.length ? Math.round((totals.reduce((s, t) => s + t, 0) / totals.length) * 10) / 10 : null;
    return { studentId, subjects: out, average, position: null };
  });

  // Competition ranking (1, 2, 2, 4) by average; students without results are unranked.
  const ranked = results.filter((r) => r.average != null).sort((a, b) => b.average! - a.average!);
  ranked.forEach((r, i) => {
    r.position = i > 0 && ranked[i - 1].average === r.average ? ranked[i - 1].position : i + 1;
  });
  return results;
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** CSV export of a results sheet (values escaped; formula-leading characters neutralised). */
export function resultsCsv(headers: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
