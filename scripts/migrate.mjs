#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in order to DATABASE_URL, recording each one so it runs once.
 * Alternative to `supabase db push` for environments without the Supabase CLI.
 *
 *   DATABASE_URL=postgresql://... node scripts/migrate.mjs          # migrations only
 *   DATABASE_URL=postgresql://... node scripts/migrate.mjs --seed   # + DEMO seed data
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (Supabase → Project Settings → Database → Connection string, session mode).");
  process.exit(1);
}

// TLS is verified. Supabase signs with its own CA: download it (Project Settings → Database → SSL
// certificate) and set DATABASE_SSL_CA to its path. Local databases connect without TLS.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ca = process.env.DATABASE_SSL_CA ? readFileSync(process.env.DATABASE_SSL_CA, "utf8") : undefined;
const client = new pg.Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: true, ...(ca && { ca }) } });
await client.connect();
try {
  await client.query("create schema if not exists app_meta; create table if not exists app_meta.applied_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await client.query("select name from app_meta.applied_migrations")).rows.map((r) => r.name));
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    process.stdout.write(`Applying ${file} … `);
    await client.query("begin");
    try {
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      await client.query("insert into app_meta.applied_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("done");
    } catch (error) {
      await client.query("rollback");
      console.log("FAILED");
      throw error;
    }
  }
  if (process.argv.includes("--seed")) {
    const seeded = (await client.query("select count(*)::int n from public.schools where is_demo")).rows[0].n;
    if (seeded > 0) console.log("Demo data already present — skipping seed.");
    else {
      process.stdout.write("Loading DEMO seed data … ");
      await client.query(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
      console.log("done");
    }
  }
  console.log("Database is up to date.");
} finally {
  await client.end();
}
