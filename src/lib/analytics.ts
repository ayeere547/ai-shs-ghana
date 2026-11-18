export type NationalAnalytics = {
  min_group_size: number;
  totals: { schools: number; students: number | null; female_students: number | null; male_students: number | null; staff: number | null; attendance_rate_30d: number | null };
  by_region: { region: string; schools: number; suppressed: boolean; students: number | null; staff: number | null; students_per_staff: number | null; attendance_rate_30d: number | null }[];
  adoption: Record<"active_schools" | "attendance_30d" | "assignments_30d" | "online_exams_30d" | "ai_30d" | "fee_invoices_90d" | "parent_portal", number>;
  plans: { plan: string; funding_model: string; schools: number }[];
  growth: { month: string; schools: number }[];
};

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) || /[",\n]/.test(s) ? `"${s.replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"` : s;
};

/** Regional table as CSV (suppressed cells stay blank). */
export function regionsCsv(a: NationalAnalytics) {
  const rows = [["Region", "Active schools", "Students", "Staff", "Students per staff", "Attendance rate (30 days, %)", "Suppressed (fewer than 3 schools)"]];
  for (const r of a.by_region) rows.push([r.region, String(r.schools), r.students == null ? "" : String(r.students), r.staff == null ? "" : String(r.staff),
    r.students_per_staff == null ? "" : String(r.students_per_staff), r.attendance_rate_30d == null ? "" : String(r.attendance_rate_30d), r.suppressed ? "yes" : "no"]);
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
