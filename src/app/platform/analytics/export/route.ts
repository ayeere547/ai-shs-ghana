import { NextResponse } from "next/server";

import { canPlatform, getSession } from "@/lib/auth/session";
import { regionsCsv, type NationalAnalytics } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

/** CSV of the aggregated regional table. Same suppression as the page; no school-level rows. */
export async function GET() {
  const session = await getSession();
  if (!canPlatform(session, "analytics.national")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("national_analytics");
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 500 });
  await supabase.rpc("log_audit", { p_action: "analytics.exported", p_entity_type: "national_analytics", p_summary: "Exported regional analytics (CSV)" });
  return new NextResponse(regionsCsv(data as NationalAnalytics), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ai-shs-ghana-regions-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
