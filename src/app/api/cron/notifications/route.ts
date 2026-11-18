import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorised } from "@/lib/cron";
import { deliverOutbox } from "@/lib/notify";

/** Delivers queued email/SMS. Call on a schedule with `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron). */
export async function GET(request: NextRequest) {
  if (!isCronAuthorised(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return NextResponse.json(await deliverOutbox());
}
