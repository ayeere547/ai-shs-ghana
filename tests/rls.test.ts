import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, grantPlatformRole, type Db } from "./db-harness";

/**
 * These tests run the REAL migrations and execute queries as specific users under the
 * `authenticated` / `anon` roles, so Row Level Security — not application code — decides each outcome.
 */
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001"; // active (sample)
const SCHOOL_B = "a0000000-0000-4000-8000-000000000002"; // active (sample)
const SCHOOL_PENDING = "a0000000-0000-4000-8000-000000000004"; // pending verification (sample)

const U = {
  superAdmin: "10000000-0000-4000-8000-000000000001",
  platformAdmin: "10000000-0000-4000-8000-000000000002",
  analyst: "10000000-0000-4000-8000-000000000003",
  headA: "20000000-0000-4000-8000-000000000001",
  teacherA: "20000000-0000-4000-8000-000000000002",
  adminA: "20000000-0000-4000-8000-000000000003",
  studentA: "20000000-0000-4000-8000-000000000004",
  headB: "30000000-0000-4000-8000-000000000001",
  pendingAdmin: "40000000-0000-4000-8000-000000000001",
  newcomer: "50000000-0000-4000-8000-000000000001",
};

let db: Db;

beforeAll(async () => {
  db = await createDatabase();
  for (const [key, id] of Object.entries(U)) await createUser(db, id, `${key.toLowerCase()}@test.example`);
  await grantPlatformRole(db, U.superAdmin, "super_admin");
  await grantPlatformRole(db, U.platformAdmin, "platform_admin");
  await grantPlatformRole(db, U.analyst, "data_analyst");
  await addMember(db, SCHOOL_A, U.headA, "headteacher");
  await addMember(db, SCHOOL_A, U.teacherA, "teacher");
  await addMember(db, SCHOOL_A, U.adminA, "school_admin");
  await addMember(db, SCHOOL_A, U.studentA, "student");
  await addMember(db, SCHOOL_B, U.headB, "headteacher");
  await addMember(db, SCHOOL_PENDING, U.pendingAdmin, "school_admin");
  await db.query(`insert into public.school_programmes (id, school_id, name) values ('d0000000-0000-4000-8000-0000000000b1', $1, 'B Science')`, [SCHOOL_B]);
});

const classesOf = (user: string | null, school: string) => asUser<{ n: number }>(db, user, `select count(*)::int n from public.school_classes where school_id = $1`, [school]);

describe("anonymous visitors", () => {
  it("cannot read schools, profiles or tenant data", async () => {
    await expect(asUser(db, null, "select * from public.schools")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, "select * from public.profiles")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, "select * from public.school_classes")).rejects.toThrow(/permission denied/);
  });

  it("see only active, opted-in schools in the public directory", async () => {
    const rows = await asUser<{ slug: string; is_demo: boolean }>(db, null, "select slug, is_demo from public.public_school_directory()");
    expect(rows.map((r) => r.slug).sort()).toEqual(["sample-coastal-girls-shs", "sample-ridge-shs", "sample-savannah-technical-shs"]);
    expect(rows.every((r) => r.is_demo)).toBe(true);
  });

  it("can read public plans but cannot call privileged RPCs", async () => {
    expect((await asUser(db, null, "select code from public.subscription_plans")).length).toBe(4);
    await expect(asUser(db, null, "select public.platform_overview()")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, `select public.register_school('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
  });
});

describe("tenant isolation", () => {
  it("School B's head cannot see School A's classes, and vice versa", async () => {
    expect((await classesOf(U.headB, SCHOOL_A))[0].n).toBe(0);
    expect((await classesOf(U.headA, SCHOOL_A))[0].n).toBe(5);
    expect((await classesOf(U.headA, SCHOOL_B))[0].n).toBe(0);
  });

  it("School B's head cannot write into School A by supplying its school_id", async () => {
    await expect(asUser(db, U.headB, `insert into public.school_classes (school_id, name, form_level) values ($1, 'Injected', 1)`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
  });

  it("a row cannot be moved to another school", async () => {
    await expect(asUser(db, U.headA, `update public.school_classes set school_id = $1 where school_id = $2`, [SCHOOL_B, SCHOOL_A])).rejects.toThrow();
  });

  it("a class cannot reference another school's programme", async () => {
    await expect(
      asUser(db, U.headA, `insert into public.school_classes (school_id, programme_id, name, form_level) values ($1, 'd0000000-0000-4000-8000-0000000000b1', 'Cross', 1)`, [SCHOOL_A]),
    ).rejects.toThrow(/foreign key/);
  });

  it("platform administrators have no blanket access to tenant records", async () => {
    expect((await classesOf(U.platformAdmin, SCHOOL_A))[0].n).toBe(0);
    expect((await classesOf(U.superAdmin, SCHOOL_A))[0].n).toBe(0);
  });

  it("a user outside every school sees no schools", async () => {
    expect((await asUser(db, U.newcomer, "select id from public.schools")).length).toBe(0);
  });
});

describe("school roles", () => {
  it("the headteacher can manage academic structure", async () => {
    const rows = await asUser(db, U.headA, `insert into public.school_classes (school_id, name, form_level) values ($1, '1 Arts B', 1) returning id`, [SCHOOL_A]);
    expect(rows.length).toBe(1);
  });

  it("a teacher can read but not change academic structure", async () => {
    expect((await classesOf(U.teacherA, SCHOOL_A))[0].n).toBe(5);
    await expect(asUser(db, U.teacherA, `insert into public.school_classes (school_id, name, form_level) values ($1, 'X', 1)`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
    expect((await asUser(db, U.teacherA, `delete from public.school_subjects where school_id = $1 returning id`, [SCHOOL_A])).length).toBe(0);
  });

  it("a student cannot list other members", async () => {
    const rows = await asUser<{ user_id: string }>(db, U.studentA, `select user_id from public.school_memberships where school_id = $1`, [SCHOOL_A]);
    expect(rows.map((r) => r.user_id)).toEqual([U.studentA]);
  });

  it("school staff may update contact fields but never status or verification fields", async () => {
    expect((await asUser(db, U.headA, `update public.schools set phone = '+233 00 111 1111' where id = $1 returning id`, [SCHOOL_A])).length).toBe(1);
    await expect(asUser(db, U.headA, `update public.schools set status = 'active' where id = $1`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.headA, `update public.schools set name = 'Renamed' where id = $1`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
  });

  it("a teacher cannot edit school settings", async () => {
    expect((await asUser(db, U.teacherA, `update public.schools set phone = 'x' where id = $1 returning id`, [SCHOOL_A])).length).toBe(0);
  });
});

describe("membership management and escalation guards", () => {
  it("memberships cannot be inserted directly", async () => {
    await expect(asUser(db, U.headA, `insert into public.school_memberships (school_id, user_id, role_id) select $1, $2, id from public.roles where key = 'headteacher'`, [SCHOOL_A, U.newcomer])).rejects.toThrow(/permission denied/);
  });

  it("the headteacher can add an existing account as a teacher", async () => {
    const rows = await asUser<{ id: string }>(db, U.headA, `select public.add_school_member($1, 'newcomer@test.example', 'teacher') as id`, [SCHOOL_A]);
    expect(rows[0].id).toBeTruthy();
  });

  it("unknown email reports no_account", async () => {
    await expect(asUser(db, U.headA, `select public.add_school_member($1, 'nobody@test.example', 'teacher')`, [SCHOOL_A])).rejects.toThrow(/no_account/);
  });

  it("a teacher cannot add members", async () => {
    await expect(asUser(db, U.teacherA, `select public.add_school_member($1, 'newcomer@test.example', 'teacher')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
  });

  it("a school admin cannot grant a role above their own", async () => {
    await expect(asUser(db, U.adminA, `select public.add_school_member($1, 'newcomer@test.example', 'headteacher')`, [SCHOOL_A])).rejects.toThrow(/above your own/);
  });

  it("a school admin cannot demote or remove the headteacher", async () => {
    const [{ id }] = (await db.query<{ id: string }>(`select id from public.school_memberships where user_id = $1`, [U.headA])).rows;
    await expect(asUser(db, U.adminA, `select public.update_school_member($1, null, 'removed')`, [id])).rejects.toThrow(/ranked above you/);
  });

  it("nobody can change their own membership", async () => {
    const [{ id }] = (await db.query<{ id: string }>(`select id from public.school_memberships where user_id = $1`, [U.adminA])).rows;
    await expect(asUser(db, U.adminA, `select public.update_school_member($1, 'headteacher', null)`, [id])).rejects.toThrow(/your own membership/);
  });

  it("the head of School B cannot manage School A's members", async () => {
    await expect(asUser(db, U.headB, `select public.add_school_member($1, 'newcomer@test.example', 'teacher')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
  });
});

describe("profiles", () => {
  it("staff with members.read see co-members; other schools' members are invisible", async () => {
    expect((await asUser(db, U.headA, `select id from public.profiles where id = $1`, [U.teacherA])).length).toBe(1);
    expect((await asUser(db, U.headB, `select id from public.profiles where id = $1`, [U.teacherA])).length).toBe(0);
    expect((await asUser(db, U.teacherA, `select id from public.profiles where id = $1`, [U.headB])).length).toBe(0);
  });

  it("users can update their own name but not their status", async () => {
    expect((await asUser(db, U.teacherA, `update public.profiles set full_name = 'T' where id = $1 returning id`, [U.teacherA])).length).toBe(1);
    await expect(asUser(db, U.teacherA, `update public.profiles set status = 'active' where id = $1`, [U.teacherA])).rejects.toThrow(/permission denied/);
  });

  it("a suspended account loses all school access", async () => {
    await db.query(`update public.profiles set status = 'suspended' where id = $1`, [U.studentA]);
    try {
      expect((await classesOf(U.studentA, SCHOOL_A))[0].n).toBe(0);
    } finally {
      await db.query(`update public.profiles set status = 'active' where id = $1`, [U.studentA]);
    }
  });
});

describe("registration and verification", () => {
  const payload = JSON.stringify({
    name: "Test Hills Senior High School", region_code: "NP", district: "Test District", address: "Box 9", email: "OFFICE@TEST-HILLS.example",
    phone: "+233 20 000 0000", headmaster_name: "Test Head", ownership: "public", boarding_type: "day", programmes_offered: ["General Arts", " "],
  });

  it("a pending school is visible to its registrant but read-only", async () => {
    expect((await asUser(db, U.pendingAdmin, `select id from public.schools where id = $1`, [SCHOOL_PENDING])).length).toBe(1);
    await expect(
      asUser(db, U.pendingAdmin, `insert into public.academic_years (school_id, name, starts_on, ends_on) values ($1, '2026/27', '2026-09-01', '2027-07-31')`, [SCHOOL_PENDING]),
    ).rejects.toThrow(/row-level security/);
  });

  it("register_school creates a pending school, the registrant's membership, an audit entry and reviewer notifications", async () => {
    await asUserSteps(db, U.newcomer, async (q) => {
      const [{ id }] = await q<{ id: string }>(`select public.register_school($1::jsonb) as id`, [payload]);
      const [school] = await q<{ status: string; email: string; programmes_offered: string[] }>(`select status, email, programmes_offered from public.schools where id = $1`, [id]);
      expect(school).toEqual({ status: "pending_verification", email: "office@test-hills.example", programmes_offered: ["General Arts"] });
      expect((await q(`select 1 from public.school_memberships where school_id = $1 and user_id = $2`, [id, U.newcomer])).length).toBe(1);
      await q("reset role");
      expect((await q(`select 1 from public.audit_logs where school_id = $1 and action = 'school.registered'`, [id])).length).toBe(1);
      const notified = await q<{ user_id: string }>(`select user_id from public.notifications where link = $1`, [`/platform/schools/${id}`]);
      expect(notified.map((n) => n.user_id).sort()).toEqual([U.superAdmin, U.platformAdmin].sort());
    });
  });

  it("only users with schools.verify can approve, and approval activates + subscribes the school", async () => {
    await expect(asUser(db, U.headA, `select public.review_school($1, 'approve')`, [SCHOOL_PENDING])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.analyst, `select public.review_school($1, 'approve')`, [SCHOOL_PENDING])).rejects.toThrow(/permission denied/);
    await asUserSteps(db, U.platformAdmin, async (q) => {
      await q(`select public.review_school($1, 'approve')`, [SCHOOL_PENDING]);
      await q("reset role");
      const [s] = await q<{ status: string; verified_by: string }>(`select status, verified_by from public.schools where id = $1`, [SCHOOL_PENDING]);
      expect(s).toEqual({ status: "active", verified_by: U.platformAdmin });
      expect((await q(`select 1 from public.subscriptions where school_id = $1`, [SCHOOL_PENDING])).length).toBe(1);
    });
  });

  it("rejection requires a reason", async () => {
    await expect(asUser(db, U.platformAdmin, `select public.review_school($1, 'reject', '  ')`, [SCHOOL_PENDING])).rejects.toThrow(/reason is required/);
  });

  it("suspending a school makes it read-only for its own staff", async () => {
    await asUserSteps(db, U.platformAdmin, async (q) => {
      await expect(q(`select public.set_school_status($1, 'suspended')`, [SCHOOL_A])).rejects.toThrow(/reason is required/);
    });
    await asUserSteps(db, U.platformAdmin, async (q) => {
      await q(`select public.set_school_status($1, 'suspended', 'Unpaid invoice review')`, [SCHOOL_A]);
      await q(`select set_config('request.jwt.claim.sub', $1, true)`, [U.headA]);
      await expect(q(`insert into public.school_classes (school_id, name, form_level) values ($1, 'Blocked', 1)`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("platform administration", () => {
  it("platform_overview returns aggregates only and excludes sample schools", async () => {
    const [{ o }] = await asUser<{ o: Record<string, unknown> }>(db, U.analyst, `select public.platform_overview() as o`);
    expect(o.schools_by_status).toEqual({});
    expect(o.demo_schools).toBe(4);
    await expect(asUser(db, U.headA, `select public.platform_overview()`)).rejects.toThrow(/permission denied/);
  });

  it("a platform admin cannot grant super_admin; a super admin can grant platform roles", async () => {
    await expect(asUser(db, U.platformAdmin, `select public.grant_platform_role('newcomer@test.example', 'super_admin')`)).rejects.toThrow(/above your own/);
    await asUserSteps(db, U.superAdmin, async (q) => {
      await q(`select public.grant_platform_role('newcomer@test.example', 'support_officer')`);
      expect((await q(`select 1 from public.platform_users where user_id = $1`, [U.newcomer])).length).toBe(1);
    });
  });

  it("a platform admin cannot revoke a super admin, and nobody can revoke themselves", async () => {
    await expect(asUser(db, U.platformAdmin, `select public.revoke_platform_role($1)`, [U.superAdmin])).rejects.toThrow(/ranked above you/);
    await expect(asUser(db, U.superAdmin, `select public.revoke_platform_role($1)`, [U.superAdmin])).rejects.toThrow(/your own/);
  });

  it("platform_users cannot be written directly", async () => {
    await expect(asUser(db, U.superAdmin, `insert into public.platform_users (user_id, role_id) select $1, id from public.roles where key = 'super_admin'`, [U.headA])).rejects.toThrow(/permission denied/);
  });
});

describe("audit log", () => {
  it("is append-only and scoped", async () => {
    await asUser(db, U.headA, `select public.log_audit('test.event', 'test', null, 'hello', $1)`, [SCHOOL_A]);
    await expect(asUser(db, U.headA, `select public.log_audit('test.event', 'test', null, 'spoof', $1)`, [SCHOOL_B])).rejects.toThrow(/not a member/);
    await expect(asUser(db, U.superAdmin, `delete from public.audit_logs`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.superAdmin, `update public.audit_logs set summary = 'x'`)).rejects.toThrow(/permission denied/);
  });

  it("school audit is visible to the school's leadership only", async () => {
    await db.query(`select public._audit(null, $1, 'x', 'y', null, 'seeded', '{}')`, [SCHOOL_A]);
    expect((await asUser(db, U.headA, `select id from public.audit_logs where school_id = $1`, [SCHOOL_A])).length).toBeGreaterThan(0);
    expect((await asUser(db, U.teacherA, `select id from public.audit_logs`)).length).toBe(0);
    expect((await asUser(db, U.headB, `select id from public.audit_logs where school_id = $1`, [SCHOOL_A])).length).toBe(0);
  });

  it("internal writers are not callable through the API", async () => {
    await expect(asUser(db, U.headA, `select public._audit(null, null, 'x', 'y', null, 'z', '{}')`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.headA, `select public._notify($1, null, 't', 'b', null)`, [U.headB])).rejects.toThrow(/permission denied/);
  });
});

describe("logo storage", () => {
  it("staff can upload only into their own school's folder", async () => {
    await expect(asUser(db, U.headA, `insert into storage.objects (bucket_id, name) values ('school-logos', $1)`, [`${SCHOOL_A}/logo.png`])).resolves.toEqual([]);
    await expect(asUser(db, U.headA, `insert into storage.objects (bucket_id, name) values ('school-logos', $1)`, [`${SCHOOL_B}/logo.png`])).rejects.toThrow(/row-level security/);
    await expect(asUser(db, U.headA, `insert into storage.objects (bucket_id, name) values ('school-logos', 'not-a-uuid/logo.png')`)).rejects.toThrow(/row-level security/);
  });
});

describe("public profile and stats RPCs", () => {
  it("public_school_profile returns listed active schools only", async () => {
    expect((await asUser(db, null, `select name from public.public_school_profile('sample-ridge-shs')`)).length).toBe(1);
    expect((await asUser(db, null, `select name from public.public_school_profile('sample-valley-community-shs')`)).length).toBe(0);
  });

  it("public_platform_stats excludes sample schools", async () => {
    const [{ s }] = await asUser<{ s: { active_schools: number } }>(db, null, `select public.public_platform_stats() as s`);
    expect(s.active_schools).toBe(0);
  });
});

describe("data integrity constraints", () => {
  it("rejects non-http(s) websites even through the registration RPC", async () => {
    const bad = JSON.stringify({ name: "Bad Link SHS", region_code: "NP", district: "D", address: "Box 1", email: "a@b.example", phone: "+233 20 000 0001", headmaster_name: "H", ownership: "public", boarding_type: "day", website: "javascript:alert(1)" });
    await expect(asUser(db, U.newcomer, `select public.register_school($1::jsonb)`, [bad])).rejects.toThrow(/check constraint/);
  });

  it("settings confirmation is writable by school managers only", async () => {
    expect((await asUser(db, U.headA, `update public.school_settings set confirmed_at = now() where school_id = $1 returning school_id`, [SCHOOL_A])).length).toBe(1);
    expect((await asUser(db, U.teacherA, `update public.school_settings set confirmed_at = now() where school_id = $1 returning school_id`, [SCHOOL_A])).length).toBe(0);
  });
});
