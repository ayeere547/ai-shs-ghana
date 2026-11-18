import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorised } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

/** Daily: renewal invoices, grace periods, past-due subscriptions and lapsed sponsorships. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorised(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("subscription_lifecycle");
  if (error) return NextResponse.json({ error: "lifecycle failed" }, { status: 500 });
  return NextResponse.json(data);
}
