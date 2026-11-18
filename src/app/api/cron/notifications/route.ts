import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { deliverOutbox } from "@/lib/notify";

/** Delivers queued email/SMS. Call on a schedule with `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron). */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await deliverOutbox());
}
