import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, type Db } from "./db-harness";

/**
 * Whole-schema checks. They run over every table and function, so a future migration that forgets
 * RLS, leaves anonymous grants, skips the school_id lock or adds an unindexed foreign key fails here.
 */
let db: Db;
const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows;

const ANON_FUNCTIONS = ["has_platform_permission", "public_platform_stats", "public_school_directory", "public_school_profile"];
const ANON_TABLES = ["regions", "subscription_plans"];
const SERVER_ONLY = ["apply_retention", "complete_online_payment", "complete_subscription_payment", "subscription_lifecycle"];

beforeAll(async () => {
  db = await createDatabase();
});

describe("schema security audit", () => {
  it("every public table has row level security", async () => {
    const missing = await rows<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(missing.map((r) => r.relname)).toEqual([]);
  });

  it("anonymous visitors can only read the region list and public plans", async () => {
    const grants = await rows<{ table_name: string; privilege_type: string }>(`select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' order by 1, 2`);
    expect(grants).toEqual(ANON_TABLES.map((t) => ({ table_name: t, privilege_type: "SELECT" })));
  });

  it("anonymous visitors can call only the public directory functions", async () => {
    const fns = await rows<{ proname: string }>(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
    expect(fns.map((f) => f.proname)).toEqual(ANON_FUNCTIONS);
  });

  it("internal helpers, trigger functions and server-only functions can't be called by signed-in users", async () => {
    const fns = await rows<{ proname: string }>(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')
        and (left(p.proname, 1) = '_' or p.prorettype = 'trigger'::regtype or p.proname = any($1))`.replace("$1", `array[${SERVER_ONLY.map((s) => `'${s}'`).join(",")}]`));
    expect(fns.map((f) => f.proname)).toEqual([]);
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const fns = await rows<{ proname: string }>(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(fns.map((f) => f.proname)).toEqual([]);
  });

  it("school_id can't be changed on any tenant table", async () => {
    const missing = await rows<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('schools', 'audit_logs', 'support_tickets')
        and not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = c.oid and p.proname = 'forbid_school_id_change')`);
    expect(missing.map((r) => r.relname)).toEqual([]);
  });

  it("every foreign key has a supporting index", async () => {
    const missing = await rows<{ fk: string }>(`select c.conrelid::regclass::text || '.' || c.conname as fk from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = 'public' and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey and c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1])`);
    expect(missing.map((r) => r.fk)).toEqual([]);
  });

  it("storage buckets for school files are private", async () => {
    const pub = await rows<{ id: string }>(`select id from storage.buckets where public and id <> 'school-logos'`);
    expect(pub.map((b) => b.id)).toEqual([]);
  });

  it("anonymous visitors still see the public directory and plans", async () => {
    expect((await asUser(db, null, `select slug from public.public_school_directory()`)).length).toBeGreaterThan(0);
    expect((await asUser(db, null, `select code from public.subscription_plans`)).length).toBeGreaterThan(0);
    await expect(asUser(db, null, `select id from public.schools`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, `select public.is_school_member('a0000000-0000-4000-8000-000000000001')`)).rejects.toThrow(/permission denied/);
  });
});

describe("Act 843: retention and data export", () => {
  const PARENT = "57000000-0000-4000-8000-000000000001";
  const OTHER = "57000000-0000-4000-8000-000000000002";
  const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await createUser(db, PARENT, "parent.export@test.example");
    await createUser(db, OTHER, "other.export@test.example");
    await addMember(db, SCHOOL_A, PARENT, "parent");
    const kid = (await db.query<{ id: string }>(`select id from public.students where school_id = $1 order by student_number limit 1`, [SCHOOL_A])).rows[0].id;
    const g = (await db.query<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Export Parent', '+233200000009', $2) returning id`, [SCHOOL_A, PARENT])).rows[0].id;
    await db.query(`insert into public.student_guardians (school_id, student_id, guardian_id, relationship) values ($1, $2, $3, 'mother')`, [SCHOOL_A, kid, g]);
    await db.query(`insert into public.notifications (user_id, title) values ($1, 'Mine'), ($2, 'Not mine')`, [PARENT, OTHER]);
  });

  it("exports only the signed-in person's own data", async () => {
    await expect(asUser(db, null, `select public.my_data_export()`)).rejects.toThrow(/permission denied/);
    const [{ e }] = await asUser<{ e: { profile: { email: string }; guardian_of: { guardian_name: string }[]; notifications: { title: string }[]; school_memberships: unknown[] } }>(db, PARENT, `select public.my_data_export() as e`);
    expect(e.profile.email).toBe("parent.export@test.example");
    expect(e.guardian_of).toHaveLength(1);
    expect(e.guardian_of[0].guardian_name).toBe("Export Parent");
    expect(e.notifications.map((n) => n.title)).toEqual(["Mine"]);
    expect(e.school_memberships).toHaveLength(1);
  });

  it("retention removes old read notifications and outbox rows but keeps unread ones; server only", async () => {
    await asUserSteps(db, PARENT, async (q) => {
      await expect(q(`select public.apply_retention()`)).rejects.toThrow(/permission denied/);
      await q("reset role");
      await q(`insert into public.notifications (user_id, title, read_at, created_at) values ($1, 'old read', now(), now() - interval '400 days'), ($1, 'old unread', null, now() - interval '400 days')`, [PARENT]);
      const [{ r }] = await q<{ r: Record<string, number> }>(`select public.apply_retention() as r`);
      expect(r.read_notifications).toBe(1);
      const left = await q<{ title: string }>(`select title from public.notifications where user_id = $1 order by title`, [PARENT]);
      expect(left.map((n) => n.title)).toEqual(["Mine", "old unread"]);
      await q(`update public.platform_settings set value = '{"read_notifications": null}' where key = 'retention_days'`);
      const [{ r2 }] = await q<{ r2: Record<string, number> }>(`select public.apply_retention() as r2`);
      expect(r2).toEqual({}); // every rule can be switched off
    });
  });
});
