import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorised } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily housekeeping (call with `Authorization: Bearer $CRON_SECRET`):
 * subscription renewals/grace/past-due and lapsed sponsorships, then data-retention rules.
 * Each job runs even if the other fails.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorised(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  const [subs, retention] = await Promise.all([admin.rpc("subscription_lifecycle"), admin.rpc("apply_retention")]);
  if (subs.error) console.error("[cron/daily] subscription_lifecycle failed:", subs.error.message);
  if (retention.error) console.error("[cron/daily] apply_retention failed:", retention.error.message);
  const ok = !subs.error && !retention.error;
  return NextResponse.json({ ok, subscriptions: subs.data ?? null, retention: retention.data ?? null }, { status: ok ? 200 : 500 });
}
