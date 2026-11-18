import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

/**
 * Runs the real migrations (and optionally the demo seed) inside an in-process Postgres, with the
 * small slice of Supabase they depend on stubbed: auth.users/auth.uid(), the API roles and storage.
 * Queries can then be executed AS a given user under the `authenticated` (or `anon`) role, so Row
 * Level Security — not application code — decides every outcome.
 */
const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const root = path.resolve(__dirname, "..");

export async function createDatabase({ seed = true } = {}) {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(SUPABASE_STUBS);
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  await db.exec("grant usage on schema extensions to anon, authenticated");
  if (seed) await db.exec(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  return db;
}

export type Db = PGlite;

/** Runs `sql` as `userId` (or anonymously when null) inside a transaction that is always rolled back. */
export async function asUser<T = Record<string, unknown>>(db: Db, userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await db.exec(userId ? "set local role authenticated" : "set local role anon");
    const res = await db.query<T>(sql, params);
    return res.rows;
  } finally {
    await db.exec("rollback");
  }
}

/** Creates an auth user (the trigger creates the profile). */
export async function createUser(db: Db, id: string, email: string) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"full_name":"Test User"}')`, [id, email]);
}

/** Grants a platform role directly (test setup only — the app uses grant_platform_role()). */
export async function grantPlatformRole(db: Db, userId: string, role: string) {
  await db.query(`insert into public.platform_users (user_id, role_id) select $1, id from public.roles where key = $2`, [userId, role]);
}

/** Adds a school membership directly (test setup only — the app uses add_school_member()). */
export async function addMember(db: Db, schoolId: string, userId: string, role: string) {
  await db.query(`insert into public.school_memberships (school_id, user_id, role_id) select $1, $2, id from public.roles where key = $3`, [schoolId, userId, role]);
}

/** Runs several statements as one user inside a single rolled-back transaction. */
export async function asUserSteps(db: Db, userId: string | null, fn: (q: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>) => Promise<void>) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await db.exec(userId ? "set local role authenticated" : "set local role anon");
    // Each step runs in a savepoint, so an expected failure doesn't abort the rest of the scenario.
    await fn(async (sql, params = []) => {
      await db.exec("savepoint step");
      try {
        const rows = (await db.query(sql, params)).rows;
        await db.exec("release savepoint step");
        return rows as never;
      } catch (error) {
        await db.exec("rollback to savepoint step");
        throw error;
      }
    });
  } finally {
    await db.exec("rollback");
  }
}
