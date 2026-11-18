#!/usr/bin/env node
/**
 * Bootstraps the first Super Administrator. The person must already have signed up.
 * After this, super admins grant platform roles from /platform/users (audited).
 *
 *   DATABASE_URL=postgresql://... node scripts/grant-super-admin.mjs person@example.com
 */
import { readFileSync } from "node:fs";

import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.DATABASE_URL;
if (!email || !url) {
  console.error("Usage: DATABASE_URL=... node scripts/grant-super-admin.mjs <email>");
  process.exit(1);
}
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ca = process.env.DATABASE_SSL_CA ? readFileSync(process.env.DATABASE_SSL_CA, "utf8") : undefined;
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: true, ...(ca && { ca }) } });
await client.connect();
try {
  const { rows } = await client.query("select id from public.profiles where lower(email) = $1", [email]);
  if (!rows.length) throw new Error(`No account found for ${email}. Sign up first, confirm the email, then re-run.`);
  await client.query("begin");
  await client.query(
    `insert into public.platform_users (user_id, role_id) select $1, id from public.roles where key = 'super_admin'
     on conflict (user_id) do update set role_id = excluded.role_id`,
    [rows[0].id],
  );
  await client.query(
    `insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary) values (null, 'platform.bootstrap_super_admin', 'platform_user', $1, $2)`,
    [rows[0].id, `Bootstrap super admin granted to ${email} via CLI`],
  );
  await client.query("commit");
  console.log(`${email} is now a Super Administrator.`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
