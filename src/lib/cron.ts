import "server-only";

import { timingSafeEqual } from "node:crypto";

/** Scheduled jobs are called with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this). */
export function isCronAuthorised(authorization: string | null) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(secret) && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
