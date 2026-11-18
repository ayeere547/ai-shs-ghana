import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, grantPlatformRole, type Db } from "./db-harness";

/** Phase 4 RLS: AI settings and quotas, knowledge base, tutor privacy & safeguarding, drafts, report comments, insights. */
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";
const SCHOOL_B = "a0000000-0000-4000-8000-000000000002";
const MATHS_TEACHER_STAFF = "e0000000-0000-4000-8000-000000000001";

const U = {
  platformAdmin: "13000000-0000-4000-8000-000000000001",
  headA: "23000000-0000-4000-8000-000000000001",
  teacherA: "23000000-0000-4000-8000-000000000002",
  idleTeacherA: "23000000-0000-4000-8000-000000000003",
  counsellorA: "23000000-0000-4000-8000-000000000004",
  studentA: "23000000-0000-4000-8000-000000000005",
  classmateA: "23000000-0000-4000-8000-000000000006",
  parentA: "23000000-0000-4000-8000-000000000007",
  headB: "33000000-0000-4000-8000-000000000001",
  studentB: "33000000-0000-4000-8000-000000000002",
};

let db: Db;
let classX: string;
let termId: string;
let childId: string;
let mathsId: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const as = (q: (s: string, p?: unknown[]) => Promise<unknown[]>, user: string) => q(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
const vec = (hot: number) => `[${Array.from({ length: 1536 }, (_, i) => (i === hot ? 1 : 0)).join(",")}]`;

beforeAll(async () => {
  db = await createDatabase();
  for (const [k, id] of Object.entries(U)) await createUser(db, id, `${k.toLowerCase()}@test.example`);
  await grantPlatformRole(db, U.platformAdmin, "platform_admin");
  await addMember(db, SCHOOL_A, U.headA, "headteacher");
  await addMember(db, SCHOOL_A, U.teacherA, "teacher");
  await addMember(db, SCHOOL_A, U.idleTeacherA, "teacher");
  await addMember(db, SCHOOL_A, U.counsellorA, "counsellor");
  await addMember(db, SCHOOL_A, U.studentA, "student");
  await addMember(db, SCHOOL_A, U.classmateA, "student");
  await addMember(db, SCHOOL_A, U.parentA, "parent");
  await addMember(db, SCHOOL_B, U.headB, "headteacher");
  await addMember(db, SCHOOL_B, U.studentB, "student");
  await db.query(`update public.staff set user_id = $1 where id = $2`, [U.teacherA, MATHS_TEACHER_STAFF]);
  classX = (await one<{ id: string }>(`select id from public.school_classes where school_id = $1 and name = '1 Science A'`, [SCHOOL_A])).id;
  termId = (await one<{ id: string }>(`select id from public.academic_terms where school_id = $1 and is_current`, [SCHOOL_A])).id;
  mathsId = (await one<{ id: string }>(`select id from public.school_subjects where school_id = $1 and code = 'CMATH'`, [SCHOOL_A])).id;
  const inX = (await db.query<{ id: string }>(`select id from public.students where class_id = $1 order by student_number`, [classX])).rows;
  childId = inX[0].id;
  await db.query(`update public.students set user_id = $1 where id = $2`, [U.studentA, inX[0].id]);
  await db.query(`update public.students set user_id = $1 where id = $2`, [U.classmateA, inX[1].id]);
  const g = await one<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Parent A', '+233200000001', $2) returning id`, [SCHOOL_A, U.parentA]);
  await db.query(`insert into public.student_guardians (school_id, student_id, guardian_id, relationship) values ($1, $2, $3, 'mother')`, [SCHOOL_A, childId, g.id]);
});

describe("AI settings and quotas", () => {
  it("schools can switch features but only platform staff can set the allowance", async () => {
    expect((await asUser(db, U.headA, `update public.ai_settings set tutor_enabled = false where school_id = $1 returning school_id`, [SCHOOL_A])).length).toBe(1);
    expect((await asUser(db, U.studentA, `update public.ai_settings set tutor_enabled = false where school_id = $1 returning school_id`, [SCHOOL_A])).length).toBe(0);
    await expect(asUser(db, U.headA, `update public.ai_settings set request_limit_override = 999999 where school_id = $1`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.headA, `select public.set_ai_limit($1, 999999)`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
  });

  it("quota follows the plan (Free = 0), platform overrides, and counts billable usage only", async () => {
    const quota = async (u: string) => (await asUser<{ q: { limit: number | null; used: number; my_tutor_messages_today: number } }>(db, u, `select public.ai_quota($1) as q`, [SCHOOL_A]))[0].q;
    expect((await quota(U.headA)).limit).toBe(0);
    await asUserSteps(db, U.platformAdmin, async (q) => {
      await q(`select public.set_ai_limit($1, 500)`, [SCHOOL_A]);
      await q("reset role");
      await q(`insert into public.ai_usage_logs (school_id, user_id, feature, model) values ($1, $2, 'tutor', 'm'), ($1, $2, 'embedding', 'm'), ($1, $2, 'tutor', 'm')`, [SCHOOL_A, U.studentA]);
      await q(`update public.ai_usage_logs set status = 'blocked' where id = (select max(id) from public.ai_usage_logs)`);
      await q("set local role authenticated");
      await as(q, U.studentA);
      const [{ r }] = await q<{ r: { limit: number; used: number; my_tutor_messages_today: number } }>(`select public.ai_quota($1) as r`, [SCHOOL_A]);
      expect([r.limit, r.used, r.my_tutor_messages_today]).toEqual([500, 1, 1]);
    });
    await expect(asUser(db, U.headB, `select public.ai_quota($1)`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
  });

  it("usage logs can't be written by users; each sees only what they should", async () => {
    await expect(asUser(db, U.studentA, `insert into public.ai_usage_logs (school_id, user_id, feature, model) values ($1, $2, 'tutor', 'm')`, [SCHOOL_A, U.studentA])).rejects.toThrow(/permission denied/);
    await db.query(`insert into public.ai_usage_logs (school_id, user_id, feature, model) values ($1, $2, 'tutor', 'm'), ($1, $3, 'notes', 'm')`, [SCHOOL_A, U.studentA, U.teacherA]);
    try {
      expect((await asUser(db, U.studentA, `select id from public.ai_usage_logs`)).length).toBe(1);
      expect((await asUser(db, U.headA, `select id from public.ai_usage_logs`)).length).toBe(2);
      expect((await asUser(db, U.headB, `select id from public.ai_usage_logs`)).length).toBe(0);
      await expect(asUser(db, U.platformAdmin, `select public.platform_ai_usage()`)).resolves.toHaveLength(1);
      await expect(asUser(db, U.headA, `select public.platform_ai_usage()`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.query(`delete from public.ai_usage_logs`);
    }
  });
});

describe("knowledge base", () => {
  it("is isolated per school, with platform content shared, and retrieval respects it", async () => {
    await asUserSteps(db, U.headA, async (q) => {
      const [a] = await q<{ id: string }>(`insert into public.knowledge_documents (school_id, title, subject_name, status) values ($1, 'A notes', 'Core Mathematics', 'ready') returning id`, [SCHOOL_A]);
      await q(`insert into public.knowledge_chunks (document_id, school_id, chunk_index, content, embedding) values ($1, $2, 0, 'Fractions: a fraction represents part of a whole.', $3)`, [a.id, SCHOOL_A, vec(1)]);
      await expect(q(`insert into public.knowledge_documents (school_id, title) values (null, 'Sneaky platform doc')`)).rejects.toThrow(/row-level security/);
      await expect(q(`insert into public.knowledge_documents (school_id, title, is_official) values ($1, 'Official', true)`, [SCHOOL_A])).rejects.toThrow(/check constraint/);

      await as(q, U.headB);
      const [b] = await q<{ id: string }>(`insert into public.knowledge_documents (school_id, title, status) values ($1, 'B notes', 'ready') returning id`, [SCHOOL_B]);
      await q(`insert into public.knowledge_chunks (document_id, school_id, chunk_index, content, embedding) values ($1, $2, 0, 'Fractions in school B private notes.', $3)`, [b.id, SCHOOL_B, vec(1)]);
      await expect(q(`insert into public.knowledge_chunks (document_id, school_id, chunk_index, content) values ($1, $2, 1, 'smuggle')`, [a.id, SCHOOL_B])).rejects.toThrow(/row-level security/);

      await as(q, U.platformAdmin);
      const [p] = await q<{ id: string }>(`insert into public.knowledge_documents (school_id, title, status, source_type, is_official, licence_note) values (null, 'Curriculum framework', 'ready', 'curriculum', true, 'Licensed for platform use') returning id`);
      await q(`insert into public.knowledge_chunks (document_id, school_id, chunk_index, content, embedding) values ($1, null, 0, 'Learners should compare and order fractions.', $2)`, [p.id, vec(2)]);

      await as(q, U.studentA);
      const kw = await q<{ title: string }>(`select title from public.match_knowledge($1, null, 'fractions', null, 10)`, [SCHOOL_A]);
      expect(kw.map((r) => r.title).sort()).toEqual(["A notes", "Curriculum framework"]);
      const near = await q<{ title: string }>(`select title from public.match_knowledge($1, $2::extensions.vector, 'x', null, 1)`, [SCHOOL_A, vec(2)]);
      expect(near.map((r) => r.title)).toEqual(["Curriculum framework"]);
      const sneaky = await q<{ title: string }>(`select title from public.match_knowledge($1, null, 'fractions', null, 10)`, [SCHOOL_B]);
      expect(sneaky.map((r) => r.title)).toEqual(["Curriculum framework"]); // school B's private doc stays hidden from A's student

      await as(q, U.idleTeacherA);
      await expect(q(`insert into public.knowledge_documents (school_id, title) values ($1, 'X')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("AI tutor privacy and safeguarding", () => {
  it("conversations are private; messages are server-written; flagged messages reach safeguarding staff only", async () => {
    await asUserSteps(db, U.studentA, async (q) => {
      const [c] = await q<{ id: string }>(`insert into public.ai_tutor_conversations (school_id, subject_id) values ($1, $2) returning id`, [SCHOOL_A, mathsId]);
      await expect(q(`insert into public.ai_tutor_messages (conversation_id, school_id, role, content) values ($1, $2, 'assistant', 'forged')`, [c.id, SCHOOL_A])).rejects.toThrow(/permission denied/);
      await q("reset role");
      await q(`insert into public.ai_tutor_messages (conversation_id, school_id, role, content) values ($1, $2, 'user', 'help with fractions'), ($1, $2, 'user', 'worrying message')`, [c.id, SCHOOL_A]);
      await q(`update public.ai_tutor_messages set flagged = true, flag_reason = 'self-harm' where content = 'worrying message'`);
      await q("set local role authenticated");
      await expect(q(`update public.ai_tutor_messages set flagged = false`)).rejects.toThrow(/permission denied/);
      expect((await q(`select id from public.ai_tutor_messages`)).length).toBe(2);

      await as(q, U.classmateA);
      expect((await q(`select id from public.ai_tutor_conversations`)).length).toBe(0);
      expect((await q(`select id from public.ai_tutor_messages`)).length).toBe(0);
      await as(q, U.teacherA);
      expect((await q(`select id from public.ai_tutor_messages`)).length).toBe(0);
      await expect(q(`insert into public.ai_tutor_conversations (school_id) values ($1)`, [SCHOOL_A])).rejects.toThrow(/row-level security/);

      await as(q, U.counsellorA);
      const flagged = await q<{ id: string; content: string }>(`select id, content from public.ai_tutor_messages`);
      expect(flagged.map((m) => m.content)).toEqual(["worrying message"]);
      await q(`select public.review_flagged_message($1)`, [flagged[0].id]);
      await as(q, U.headB);
      expect((await q(`select id from public.ai_tutor_messages`)).length).toBe(0);
      await as(q, U.teacherA);
      await expect(q(`select public.review_flagged_message($1)`, [flagged[0].id])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("teacher drafts and report comments", () => {
  it("drafts are private to their author", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      await q(`insert into public.ai_drafts (school_id, kind, title) values ($1, 'lesson_plan', 'Fractions lesson')`, [SCHOOL_A]);
      await as(q, U.idleTeacherA);
      expect((await q(`select id from public.ai_drafts`)).length).toBe(0);
      await as(q, U.studentA);
      await expect(q(`insert into public.ai_drafts (school_id, kind, title) values ($1, 'notes', 'x')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
    });
  });

  it("report comments need approval, revert to draft on edit, and reach families only once results are published", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const [c] = await q<{ id: string }>(`insert into public.report_comments (school_id, student_id, term_id, comment, ai_assisted) values ($1, $2, $3, 'Works hard in maths.', true) returning id`, [SCHOOL_A, childId, termId]);
      await q(`update public.report_comments set status = 'approved' where id = $1`, [c.id]);
      const [ap] = await q<{ approved_at: string | null }>(`select approved_at from public.report_comments where id = $1`, [c.id]);
      expect(ap.approved_at).not.toBeNull();
      await q(`update public.report_comments set comment = 'Works hard in maths and helps others.' where id = $1`, [c.id]);
      const [d] = await q<{ status: string }>(`select status from public.report_comments where id = $1`, [c.id]);
      expect(d.status).toBe("draft");
      await q(`update public.report_comments set status = 'approved' where id = $1`, [c.id]);

      await as(q, U.studentA);
      expect((await q(`select id from public.report_comments`)).length).toBe(0); // not published yet
      await as(q, U.headA);
      await q(`select public.publish_results($1, $2)`, [termId, classX]);
      await as(q, U.studentA);
      expect((await q(`select id from public.report_comments`)).length).toBe(1);
      await as(q, U.parentA);
      expect((await q(`select id from public.report_comments`)).length).toBe(1);
      await as(q, U.idleTeacherA);
      await expect(q(`insert into public.report_comments (school_id, student_id, term_id, comment) values ($1, $2, $3, 'Not my student')`, [SCHOOL_A, childId, termId])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("learning insights", () => {
  it("are available to the class's teachers and results staff only", async () => {
    await db.query(`insert into public.attendance (school_id, student_id, class_id, attendance_date, status) values ($1, $2, $3, current_date, 'absent')`, [SCHOOL_A, childId, classX]);
    try {
      const [{ i }] = await asUser<{ i: { students: { student_id: string; attendance_rate: number; flags: string[] }[] } }>(db, U.teacherA, `select public.class_insights($1, $2) as i`, [classX, termId]);
      const me = i.students.find((s) => s.student_id === childId)!;
      expect(me.attendance_rate).toBe(0);
      expect(me.flags).toContain("low_attendance");
      await expect(asUser(db, U.headA, `select public.class_insights($1, $2)`, [classX, termId])).resolves.toHaveLength(1);
      await expect(asUser(db, U.idleTeacherA, `select public.class_insights($1, $2)`, [classX, termId])).rejects.toThrow(/permission denied/);
      await expect(asUser(db, U.studentA, `select public.class_insights($1, $2)`, [classX, termId])).rejects.toThrow(/permission denied/);
      await expect(asUser(db, U.headB, `select public.class_insights($1, $2)`, [classX, termId])).rejects.toThrow(/class or term not found|permission denied/);
    } finally {
      await db.query(`delete from public.attendance`);
    }
  });
});
