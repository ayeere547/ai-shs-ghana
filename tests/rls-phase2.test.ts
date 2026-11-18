import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, type Db } from "./db-harness";

/** Phase 2 RLS: students, guardians, staff, timetable, attendance, assessments and results — enforced by the database. */
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";
const SCHOOL_B = "a0000000-0000-4000-8000-000000000002";
const MATHS_TEACHER_STAFF = "e0000000-0000-4000-8000-000000000001"; // teaches Core Mathematics in every sample class

const U = {
  headA: "21000000-0000-4000-8000-000000000001",
  teacherA: "21000000-0000-4000-8000-000000000002", // linked to MATHS_TEACHER_STAFF
  idleTeacherA: "21000000-0000-4000-8000-000000000003", // teacher with no assignments
  examOfficerA: "21000000-0000-4000-8000-000000000004",
  hrA: "21000000-0000-4000-8000-000000000005",
  studentA: "21000000-0000-4000-8000-000000000006",
  parentA: "21000000-0000-4000-8000-000000000007",
  otherParentA: "21000000-0000-4000-8000-000000000008",
  headB: "31000000-0000-4000-8000-000000000001",
  newcomer: "51000000-0000-4000-8000-000000000001",
};

let db: Db;
let classX: string; // a sample class
let classY: string; // another sample class
let mathsId: string;
let physicsId: string;
let termId: string;
let childId: string; // student linked to studentA and parentA
let otherChildId: string; // student linked to otherParentA
let classmateId: string; // another student in classX

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  db = await createDatabase();
  for (const [k, id] of Object.entries(U)) await createUser(db, id, `${k.toLowerCase()}@test.example`);
  await addMember(db, SCHOOL_A, U.headA, "headteacher");
  await addMember(db, SCHOOL_A, U.teacherA, "teacher");
  await addMember(db, SCHOOL_A, U.idleTeacherA, "teacher");
  await addMember(db, SCHOOL_A, U.examOfficerA, "exam_officer");
  await addMember(db, SCHOOL_A, U.hrA, "hr_officer");
  await addMember(db, SCHOOL_A, U.studentA, "student");
  await addMember(db, SCHOOL_A, U.parentA, "parent");
  await addMember(db, SCHOOL_A, U.otherParentA, "parent");
  await addMember(db, SCHOOL_B, U.headB, "headteacher");
  await db.query(`update public.staff set user_id = $1 where id = $2`, [U.teacherA, MATHS_TEACHER_STAFF]);

  classX = (await one<{ id: string }>(`select id from public.school_classes where school_id = $1 and name = '1 Science A'`, [SCHOOL_A])).id;
  classY = (await one<{ id: string }>(`select id from public.school_classes where school_id = $1 and name = '2 Science A'`, [SCHOOL_A])).id;
  mathsId = (await one<{ id: string }>(`select id from public.school_subjects where school_id = $1 and code = 'CMATH'`, [SCHOOL_A])).id;
  physicsId = (await one<{ id: string }>(`select id from public.school_subjects where school_id = $1 and code = 'PHY'`, [SCHOOL_A])).id;
  termId = (await one<{ id: string }>(`select id from public.academic_terms where school_id = $1 and is_current`, [SCHOOL_A])).id;

  const inX = (await db.query<{ id: string }>(`select id from public.students where class_id = $1 order by student_number`, [classX])).rows;
  [childId, classmateId] = [inX[0].id, inX[1].id];
  otherChildId = (await one<{ id: string }>(`select id from public.students where class_id = $1 order by student_number limit 1`, [classY])).id;

  await db.query(`update public.students set user_id = $1 where id = $2`, [U.studentA, childId]);
  const g1 = await one<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Parent A', '+233200000001', $2) returning id`, [SCHOOL_A, U.parentA]);
  const g2 = await one<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Parent B', '+233200000002', $2) returning id`, [SCHOOL_A, U.otherParentA]);
  await db.query(`insert into public.student_guardians (school_id, student_id, guardian_id, relationship) values ($1, $2, $3, 'mother'), ($1, $4, $5, 'father')`, [SCHOOL_A, childId, g1.id, otherChildId, g2.id]);
});

const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);

describe("students and guardians", () => {
  it("are invisible to other schools, and cannot be created in another school", async () => {
    expect((await asUser(db, U.headB, `select id from public.students where school_id = $1`, [SCHOOL_A])).length).toBe(0);
    await expect(asUser(db, U.headB, `insert into public.students (school_id, student_number, first_name, last_name, gender) values ($1, 'X1', 'A', 'B', 'male')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
  });

  it("a student sees only their own record", async () => {
    expect(ids(await asUser<{ id: string }>(db, U.studentA, `select id from public.students`))).toEqual([childId]);
  });

  it("a parent sees only their linked child, never an unrelated child", async () => {
    expect(ids(await asUser<{ id: string }>(db, U.parentA, `select id from public.students`))).toEqual([childId]);
    expect((await asUser(db, U.parentA, `select id from public.students where id = $1`, [otherChildId])).length).toBe(0);
    expect((await asUser(db, U.parentA, `select id from public.guardians`)).length).toBe(1);
  });

  it("a parent whose view permission is revoked loses access", async () => {
    await db.query(`update public.student_guardians set can_view_records = false where student_id = $1`, [childId]);
    try {
      expect((await asUser(db, U.parentA, `select id from public.students`)).length).toBe(0);
    } finally {
      await db.query(`update public.student_guardians set can_view_records = true where student_id = $1`, [childId]);
    }
  });

  it("teachers can read students but not change them", async () => {
    expect((await asUser(db, U.teacherA, `select id from public.students`)).length).toBe(40);
    expect((await asUser(db, U.teacherA, `update public.students set first_name = 'X' where id = $1 returning id`, [childId])).length).toBe(0);
  });

  it("status history can only be written through change_student_status", async () => {
    await expect(asUser(db, U.headA, `insert into public.student_status_history (school_id, student_id, to_status) values ($1, $2, 'graduated')`, [SCHOOL_A, childId])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.headA, `select public.change_student_status($1, 'transferred')`, [childId])).rejects.toThrow(/reason is required/);
    await expect(asUser(db, U.teacherA, `select public.change_student_status($1, 'suspended', null, 'x')`, [childId])).rejects.toThrow(/permission denied/);
    await asUserSteps(db, U.headA, async (q) => {
      await q(`select public.change_student_status($1, 'transferred', null, 'Moved to another school')`, [classmateId]);
      const [h] = await q<{ to_status: string; from_status: string }>(`select from_status, to_status from public.student_status_history where student_id = $1`, [classmateId]);
      expect(h).toEqual({ from_status: "active", to_status: "transferred" });
    });
  });

  it("promote_class moves or graduates every active student of a class", async () => {
    await asUserSteps(db, U.headA, async (q) => {
      const [{ n }] = await q<{ n: number }>(`select public.promote_class($1, $2) as n`, [classX, classY]);
      expect(n).toBe(8);
      expect((await q(`select id from public.students where class_id = $1 and status = 'active'`, [classX])).length).toBe(0);
      const [{ g }] = await q<{ g: number }>(`select public.promote_class($1, null) as g`, [classY]);
      expect(g).toBe(16);
    });
    await expect(asUser(db, U.headB, `select public.promote_class($1, null)`, [classX])).rejects.toThrow(/permission denied/);
  });

  it("issues sequential school-prefixed student numbers to managers only", async () => {
    const [{ n }] = await asUser<{ n: string }>(db, U.headA, `select public.next_school_number($1, 'student') as n`, [SCHOOL_A]);
    expect(n).toMatch(/^DEMO001\/\d{2}\/00041$/);
    await expect(asUser(db, U.teacherA, `select public.next_school_number($1, 'student')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
  });

  it("link_account adds a parent membership but refuses staff accounts", async () => {
    const [{ id: gid }] = (await db.query<{ id: string }>(`select id from public.guardians where full_name = 'Parent B'`)).rows;
    await expect(asUser(db, U.headA, `select public.link_account('guardian', $1, 'teachera@test.example')`, [gid])).rejects.toThrow(/staff member/);
    await asUserSteps(db, U.headA, async (q) => {
      await q(`select public.link_account('guardian', $1, 'newcomer@test.example')`, [gid]);
      await q("reset role");
      const [m] = await q<{ key: string }>(`select r.key from public.school_memberships m join public.roles r on r.id = m.role_id where m.user_id = $1`, [U.newcomer]);
      expect(m.key).toBe("parent");
    });
  });
});

describe("staff", () => {
  it("HR can manage staff but not students; teachers cannot edit staff", async () => {
    expect((await asUser(db, U.hrA, `update public.staff set job_title = 'Senior Teacher' where id = $1 returning id`, [MATHS_TEACHER_STAFF])).length).toBe(1);
    await expect(asUser(db, U.hrA, `select id from public.students`)).resolves.toEqual([]);
    expect((await asUser(db, U.teacherA, `update public.staff set job_title = 'X' where id = $1 returning id`, [MATHS_TEACHER_STAFF])).length).toBe(0);
  });

  it("a student cannot read the staff directory", async () => {
    expect((await asUser(db, U.studentA, `select id from public.staff`)).length).toBe(0);
  });
});

describe("attendance", () => {
  const mark = (user: string, student: string, cls: string) =>
    asUser(db, user, `insert into public.attendance (school_id, student_id, class_id, attendance_date, status) values ($1, $2, $3, current_date, 'present')`, [SCHOOL_A, student, cls]);

  it("a teacher can take attendance for a class they teach", async () => {
    await expect(mark(U.teacherA, childId, classX)).resolves.toEqual([]);
  });

  it("a teacher without an assignment for the class cannot", async () => {
    await expect(mark(U.idleTeacherA, childId, classX)).rejects.toThrow(/row-level security/);
  });

  it("attendance must match the student's current class", async () => {
    await expect(mark(U.teacherA, otherChildId, classX)).rejects.toThrow(/not an active member of this class/);
  });

  it("students and parents read only their own attendance", async () => {
    await db.query(`insert into public.attendance (school_id, student_id, class_id, attendance_date, status) values ($1, $2, $3, current_date, 'absent'), ($1, $4, $3, current_date, 'present')`, [SCHOOL_A, childId, classX, classmateId]);
    try {
      expect((await asUser(db, U.studentA, `select id from public.attendance`)).length).toBe(1);
      expect((await asUser(db, U.otherParentA, `select id from public.attendance`)).length).toBe(0);
    } finally {
      await db.query(`delete from public.attendance`);
    }
  });
});

describe("assessments and results", () => {
  let assessmentId: string;

  beforeAll(async () => {
    assessmentId = (await one<{ id: string }>(
      `insert into public.assessments (school_id, term_id, class_id, subject_id, name, kind, max_score, weight) values ($1, $2, $3, $4, 'Test 1', 'class_test', 20, 30) returning id`,
      [SCHOOL_A, termId, classX, mathsId],
    )).id;
    await db.query(`insert into public.assessment_scores (school_id, assessment_id, student_id, score) values ($1, $2, $3, 15)`, [SCHOOL_A, assessmentId, childId]);
  });

  it("the subject teacher can create assessments for their subject only", async () => {
    await expect(asUser(db, U.teacherA, `insert into public.assessments (school_id, term_id, class_id, subject_id, name, kind, max_score, weight) values ($1, $2, $3, $4, 'Quiz', 'class_test', 10, 10)`, [SCHOOL_A, termId, classX, mathsId])).resolves.toEqual([]);
    await expect(asUser(db, U.teacherA, `insert into public.assessments (school_id, term_id, class_id, subject_id, name, kind, max_score, weight) values ($1, $2, $3, $4, 'Quiz', 'class_test', 10, 10)`, [SCHOOL_A, termId, classX, physicsId])).rejects.toThrow(/row-level security/);
  });

  it("scores above the maximum, or for students outside the class, are rejected", async () => {
    await expect(asUser(db, U.teacherA, `insert into public.assessment_scores (school_id, assessment_id, student_id, score) values ($1, $2, $3, 25)`, [SCHOOL_A, assessmentId, classmateId])).rejects.toThrow(/exceeds the maximum/);
    await expect(asUser(db, U.teacherA, `insert into public.assessment_scores (school_id, assessment_id, student_id, score) values ($1, $2, $3, 5)`, [SCHOOL_A, assessmentId, otherChildId])).rejects.toThrow(/not in the assessed class/);
  });

  it("a teacher without the assignment cannot see or enter scores", async () => {
    expect((await asUser(db, U.idleTeacherA, `select id from public.assessment_scores`)).length).toBe(0);
    await expect(asUser(db, U.idleTeacherA, `insert into public.assessment_scores (school_id, assessment_id, student_id, score) values ($1, $2, $3, 5)`, [SCHOOL_A, assessmentId, classmateId])).rejects.toThrow(/row-level security/);
  });

  it("students and parents see scores only after results are published", async () => {
    expect((await asUser(db, U.studentA, `select id from public.assessment_scores`)).length).toBe(0);
    expect((await asUser(db, U.parentA, `select id from public.assessment_scores`)).length).toBe(0);
    await expect(asUser(db, U.teacherA, `select public.publish_results($1, $2)`, [termId, classX])).rejects.toThrow(/permission denied/);
    await asUserSteps(db, U.examOfficerA, async (q) => {
      await q(`select public.publish_results($1, $2)`, [termId, classX]);
      await q(`select set_config('request.jwt.claim.sub', $1, true)`, [U.studentA]);
      expect((await q(`select id from public.assessment_scores`)).length).toBe(1);
      await q(`select set_config('request.jwt.claim.sub', $1, true)`, [U.otherParentA]);
      expect((await q(`select id from public.assessment_scores`)).length).toBe(0);
    });
  });

  it("grading schemes are editable only with assessments.manage", async () => {
    expect((await asUser(db, U.teacherA, `update public.grading_bands set remark = 'x' returning id`)).length).toBe(0);
    expect((await asUser(db, U.examOfficerA, `update public.grading_bands set remark = 'x' returning id`)).length).toBe(6);
  });
});

describe("timetable", () => {
  it("the database rejects double-booking a teacher", async () => {
    const [p] = (await db.query<{ id: string }>(`select id from public.timetable_periods where school_id = $1 and not is_break order by starts_at limit 1`, [SCHOOL_A])).rows;
    await asUserSteps(db, U.headA, async (q) => {
      await q(`insert into public.timetable_slots (school_id, term_id, class_id, day_of_week, period_id, subject_id, staff_id) values ($1, $2, $3, 1, $4, $5, $6)`, [SCHOOL_A, termId, classX, p.id, mathsId, MATHS_TEACHER_STAFF]);
      await expect(q(`insert into public.timetable_slots (school_id, term_id, class_id, day_of_week, period_id, subject_id, staff_id) values ($1, $2, $3, 1, $4, $5, $6)`, [SCHOOL_A, termId, classY, p.id, mathsId, MATHS_TEACHER_STAFF])).rejects.toThrow(/timetable_teacher_clash/);
    });
  });

  it("teachers can read but not edit the timetable", async () => {
    const [p] = (await db.query<{ id: string }>(`select id from public.timetable_periods where school_id = $1 and not is_break order by starts_at limit 1`, [SCHOOL_A])).rows;
    await expect(asUser(db, U.teacherA, `insert into public.timetable_slots (school_id, term_id, class_id, day_of_week, period_id, subject_id) values ($1, $2, $3, 2, $4, $5)`, [SCHOOL_A, termId, classX, p.id, mathsId])).rejects.toThrow(/row-level security/);
    expect((await asUser(db, U.studentA, `select id from public.timetable_periods`)).length).toBe(8);
  });

  it("replace_timetable requires timetable.manage", async () => {
    await expect(asUser(db, U.teacherA, `select public.replace_timetable($1, $2, $3, '[]'::jsonb)`, [SCHOOL_A, termId, [classX]])).rejects.toThrow(/permission denied/);
  });
});

describe("account links", () => {
  it("user_id cannot be written directly on students, guardians or staff", async () => {
    await expect(asUser(db, U.headA, `update public.students set user_id = $1 where id = $2`, [U.headA, classmateId])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.headA, `update public.staff set user_id = $1 where id = $2`, [U.headA, MATHS_TEACHER_STAFF])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.headA, `insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'X Y', '+233200000009', $2)`, [SCHOOL_A, U.headA])).rejects.toThrow(/permission denied/);
  });

  it("link_staff_account accepts only staff members of the same school", async () => {
    await expect(asUser(db, U.hrA, `select public.link_staff_account($1, 'studenta@test.example')`, [MATHS_TEACHER_STAFF])).rejects.toThrow(/not_staff_member/);
    await expect(asUser(db, U.hrA, `select public.link_staff_account($1, 'headb@test.example')`, [MATHS_TEACHER_STAFF])).rejects.toThrow(/not_staff_member/);
    await expect(asUser(db, U.hrA, `select public.link_staff_account($1, 'idleteachera@test.example')`, [MATHS_TEACHER_STAFF])).resolves.toBeDefined();
  });
});
