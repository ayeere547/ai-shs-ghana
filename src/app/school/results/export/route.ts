import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSchoolContext } from "@/lib/auth/session";
import { resultsCsv } from "@/lib/results/compute";
import { loadClassResults } from "@/lib/results/load";

/** CSV export of a results sheet. Same permissions as the page; RLS limits the data returned. */
export async function GET(request: NextRequest) {
  const ctx = await getSchoolContext();
  const p = ctx?.school.permissions;
  if (!ctx || !(p!.has("results.read") || p!.has("assessments.manage") || p!.has("assessments.record"))) return new NextResponse("Forbidden", { status: 403 });
  const q = z.object({ term: z.uuid(), class: z.uuid() }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!q.success) return new NextResponse("Bad request", { status: 400 });

  const r = await loadClassResults(ctx.school.schoolId, q.data.term, q.data.class);
  if (!r.students.length) return new NextResponse("Not found", { status: 404 });
  const headers = ["Student number", "Student", ...r.subjects.flatMap((s) => [`${s.name} %`, `${s.name} grade`]), "Average", "Position"];
  const rows = r.students.map((s) => {
    const res = r.results.get(s.id);
    return [s.number, s.name, ...r.subjects.flatMap((sub) => [res?.subjects[sub.id]?.total ?? null, res?.subjects[sub.id]?.grade ?? null]), res?.average ?? null, res?.position ?? null];
  });
  return new NextResponse(`﻿${resultsCsv(headers, rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results-${q.data.class.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
