import { NextResponse } from "next/server";

import { isSupabaseConfigured, publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Uptime check for monitors. Reports whether the app can reach the database; never secrets or versions.
 * 200 = healthy, 503 = not configured or database unreachable.
 */
export async function GET() {
  const started = Date.now();
  if (!isSupabaseConfigured()) return NextResponse.json({ status: "not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let database = "down";
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/rest/v1/regions?select=code&limit=1`, {
      headers: { apikey: publicEnv.supabaseAnonKey, Authorization: `Bearer ${publicEnv.supabaseAnonKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    database = res.ok ? "up" : "down";
  } catch {
    database = "down";
  }
  const ok = database === "up";
  return NextResponse.json({ status: ok ? "ok" : "degraded", database, latency_ms: Date.now() - started }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
