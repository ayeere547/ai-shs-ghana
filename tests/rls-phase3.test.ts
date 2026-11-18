import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, type Db } from "./db-harness";

/** Phase 3 RLS: classroom, assignments, library, question bank and online exams. */
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";
const SCHOOL_B = "a0000000-0000-4000-8000-000000000002";
const MATHS_TEACHER_STAFF = "e0000000-0000-4000-8000-000000000001";

const U = {
  headA: "22000000-0000-4000-8000-000000000001",
  teacherA: "22000000-0000-4000-8000-000000000002",
  idleTeacherA: "22000000-0000-4000-8000-000000000003",
  librarianA: "22000000-0000-4000-8000-000000000004",
  studentA: "22000000-0000-4000-8000-000000000005", // in classX
  classmateA: "22000000-0000-4000-8000-000000000006", // in classX
  studentY: "22000000-0000-4000-8000-000000000007", // in classY
  parentA: "22000000-0000-4000-8000-000000000008", // guardian of studentA's record
  headB: "32000000-0000-4000-8000-000000000001",
};

let db: Db;
let classX: string;
let classY: string;
let mathsId: string;
let physicsId: string;
let termId: string;
let childId: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const as = (q: (s: string, p?: unknown[]) => Promise<unknown[]>, user: string) => q(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);

beforeAll(async () => {
  db = await createDatabase();
  for (const [k, id] of Object.entries(U)) await createUser(db, id, `${k.toLowerCase()}@test.example`);
  await addMember(db, SCHOOL_A, U.headA, "headteacher");
  await addMember(db, SCHOOL_A, U.teacherA, "teacher");
  await addMember(db, SCHOOL_A, U.idleTeacherA, "teacher");
  await addMember(db, SCHOOL_A, U.librarianA, "librarian");
  for (const u of [U.studentA, U.classmateA, U.studentY]) await addMember(db, SCHOOL_A, u, "student");
  await addMember(db, SCHOOL_A, U.parentA, "parent");
  await addMember(db, SCHOOL_B, U.headB, "headteacher");
  await db.query(`update public.staff set user_id = $1 where id = $2`, [U.teacherA, MATHS_TEACHER_STAFF]);

  classX = (await one<{ id: string }>(`select id from public.school_classes where school_id = $1 and name = '1 Science A'`, [SCHOOL_A])).id;
  classY = (await one<{ id: string }>(`select id from public.school_classes where school_id = $1 and name = '2 Science A'`, [SCHOOL_A])).id;
  mathsId = (await one<{ id: string }>(`select id from public.school_subjects where school_id = $1 and code = 'CMATH'`, [SCHOOL_A])).id;
  physicsId = (await one<{ id: string }>(`select id from public.school_subjects where school_id = $1 and code = 'PHY'`, [SCHOOL_A])).id;
  termId = (await one<{ id: string }>(`select id from public.academic_terms where school_id = $1 and is_current`, [SCHOOL_A])).id;
  const inX = (await db.query<{ id: string }>(`select id from public.students where class_id = $1 order by student_number`, [classX])).rows;
  childId = inX[0].id;
  await db.query(`update public.students set user_id = $1 where id = $2`, [U.studentA, inX[0].id]);
  await db.query(`update public.students set user_id = $1 where id = $2`, [U.classmateA, inX[1].id]);
  const y = await one<{ id: string }>(`select id from public.students where class_id = $1 order by student_number limit 1`, [classY]);
  await db.query(`update public.students set user_id = $1 where id = $2`, [U.studentY, y.id]);
  const g = await one<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Parent A', '+233200000001', $2) returning id`, [SCHOOL_A, U.parentA]);
  await db.query(`insert into public.student_guardians (school_id, student_id, guardian_id, relationship) values ($1, $2, $3, 'mother')`, [SCHOOL_A, childId, g.id]);
});

describe("digital classroom", () => {
  it("teachers publish materials only for subjects they teach; students see their own class's published materials", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      await q(`insert into public.learning_materials (school_id, class_id, subject_id, title, kind, body) values ($1, $2, $3, 'Fractions notes', 'note', 'Body'), ($1, $2, $3, 'Draft', 'note', 'x')`, [SCHOOL_A, classX, mathsId]);
      await q(`update public.learning_materials set is_published = false where title = 'Draft'`);
      await expect(q(`insert into public.learning_materials (school_id, class_id, subject_id, title, kind, body) values ($1, $2, $3, 'Physics', 'note', 'x')`, [SCHOOL_A, classX, physicsId])).rejects.toThrow(/row-level security/);
      await as(q, U.studentA);
      expect((await q<{ title: string }>(`select title from public.learning_materials`)).map((r) => r.title)).toEqual(["Fractions notes"]);
      await as(q, U.studentY);
      expect((await q(`select id from public.learning_materials`)).length).toBe(0);
      await as(q, U.headB);
      expect((await q(`select id from public.learning_materials`)).length).toBe(0);
    });
  });

  it("rejects non-http material links", async () => {
    await expect(asUser(db, U.teacherA, `insert into public.learning_materials (school_id, class_id, subject_id, title, kind, url) values ($1, $2, $3, 'Bad', 'link', 'javascript:alert(1)')`, [SCHOOL_A, classX, mathsId])).rejects.toThrow(/check constraint/);
  });

  it("announcements respect audience and authority", async () => {
    await asUserSteps(db, U.headA, async (q) => {
      await q(`insert into public.announcements (school_id, audience, title, body) values ($1, 'staff', 'Staff meeting', 'x'), ($1, 'all', 'Sports day', 'x')`, [SCHOOL_A]);
      await as(q, U.studentA);
      expect((await q<{ title: string }>(`select title from public.announcements`)).map((r) => r.title)).toEqual(["Sports day"]);
      await as(q, U.teacherA);
      await expect(q(`insert into public.announcements (school_id, audience, title, body) values ($1, 'all', 'X', 'x')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
      await q(`insert into public.announcements (school_id, class_id, title, body) values ($1, $2, 'Bring calculators', 'x')`, [SCHOOL_A, classX]);
      await as(q, U.idleTeacherA);
      await expect(q(`insert into public.announcements (school_id, class_id, title, body) values ($1, $2, 'X', 'x')`, [SCHOOL_A, classX])).rejects.toThrow(/row-level security/);
      await as(q, U.studentY);
      expect((await q(`select id from public.announcements where class_id is not null`)).length).toBe(0);
    });
  });

  it("discussion: classmates post, teachers moderate, hidden posts disappear for others", async () => {
    await asUserSteps(db, U.studentA, async (q) => {
      const [post] = await q<{ id: string }>(`insert into public.classroom_posts (school_id, class_id, subject_id, author_id, body) values ($1, $2, $3, $4, 'How do I simplify 6/8?') returning id`, [SCHOOL_A, classX, mathsId, U.studentA]);
      await expect(q(`update public.classroom_posts set is_hidden = false where id = $1`, [post.id])).rejects.toThrow(/permission denied/);
      await as(q, U.studentY);
      await expect(q(`insert into public.classroom_posts (school_id, class_id, subject_id, author_id, body) values ($1, $2, $3, $4, 'Hi')`, [SCHOOL_A, classX, mathsId, U.studentY])).rejects.toThrow(/row-level security/);
      await as(q, U.classmateA);
      await expect(q(`insert into public.classroom_posts (school_id, class_id, subject_id, author_id, body) values ($1, $2, $3, $4, 'Spoofed')`, [SCHOOL_A, classX, mathsId, U.studentA])).rejects.toThrow(/row-level security/);
      await expect(q(`select public.moderate_post($1, true)`, [post.id])).rejects.toThrow(/permission denied/);
      await as(q, U.teacherA);
      await q(`select public.moderate_post($1, true)`, [post.id]);
      await as(q, U.classmateA);
      expect((await q(`select id from public.classroom_posts`)).length).toBe(0);
      await as(q, U.studentA);
      expect((await q(`select id from public.classroom_posts`)).length).toBe(1);
      const names = await q<{ display_name: string; is_teacher: boolean }>(`select display_name, is_teacher from public.classroom_names($1, $2)`, [classX, mathsId]);
      expect(names.find((n) => n.is_teacher)?.display_name).toBe("Mrs Teacher One");
      await as(q, U.studentY);
      await expect(q(`select * from public.classroom_names($1, $2)`, [classX, mathsId])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("assignments", () => {
  const create = `insert into public.assignments (school_id, class_id, subject_id, title, instructions, due_at, max_score) values ($1, $2, $3, 'Homework 1', 'Do it', now() + interval '2 days', 20) returning id`;

  it("runs the full submit → resubmit → mark → return cycle with the right people", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const [a] = await q<{ id: string }>(create, [SCHOOL_A, classX, mathsId]);
      await as(q, U.studentA);
      await expect(q(`insert into public.assignment_submissions (school_id, assignment_id, student_id, body) values ($1, $2, $3, 'x')`, [SCHOOL_A, a.id, childId])).rejects.toThrow(/permission denied/);
      const [{ s }] = await q<{ s: string }>(`select public.submit_assignment($1, 'First try') as s`, [a.id]);
      await q(`select public.submit_assignment($1, 'Second try')`, [a.id]);
      await as(q, U.studentY);
      await expect(q(`select public.submit_assignment($1, 'Not my class')`, [a.id])).rejects.toThrow(/not available/);
      await as(q, U.idleTeacherA);
      expect((await q(`select id from public.assignment_submissions`)).length).toBe(0);
      await expect(q(`select public.mark_submission($1, 10)`, [s])).rejects.toThrow(/permission denied/);
      await as(q, U.parentA);
      expect((await q(`select id from public.assignment_submissions`)).length).toBe(0); // not returned yet
      await as(q, U.teacherA);
      const [sub] = await q<{ body: string }>(`select body from public.assignment_submissions where id = $1`, [s]);
      expect(sub.body).toBe("Second try");
      await expect(q(`select public.mark_submission($1, 25)`, [s])).rejects.toThrow(/between 0 and 20/);
      await q(`select public.mark_submission($1, 17, 'Good work')`, [s]);
      await as(q, U.studentA);
      await expect(q(`select public.submit_assignment($1, 'Third')`, [a.id])).rejects.toThrow(/already been marked/);
      const [mine] = await q<{ score: string; feedback: string }>(`select score, feedback from public.assignment_submissions`);
      expect([Number(mine.score), mine.feedback]).toEqual([17, "Good work"]);
      await as(q, U.parentA);
      expect((await q(`select id from public.assignment_submissions`)).length).toBe(1);
    });
  });

  it("rejects late work unless the teacher allows it", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const [a] = await q<{ id: string }>(`insert into public.assignments (school_id, class_id, subject_id, title, instructions, due_at) values ($1, $2, $3, 'Old', 'x', now() - interval '1 day') returning id`, [SCHOOL_A, classX, mathsId]);
      await as(q, U.studentA);
      await expect(q(`select public.submit_assignment($1, 'late')`, [a.id])).rejects.toThrow(/deadline has passed/);
      await as(q, U.teacherA);
      await q(`update public.assignments set allow_late = true where id = $1`, [a.id]);
      await as(q, U.studentA);
      await q(`select public.submit_assignment($1, 'late')`, [a.id]);
      const [{ is_late }] = await q<{ is_late: boolean }>(`select is_late from public.assignment_submissions where assignment_id = $1`, [a.id]);
      expect(is_late).toBe(true);
    });
  });

  it("submission file paths must be the student's own folder", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const [a] = await q<{ id: string }>(create, [SCHOOL_A, classX, mathsId]);
      await as(q, U.studentA);
      await expect(q(`select public.submit_assignment($1, null, $2)`, [a.id, `${SCHOOL_A}/submissions/${a.id}/someone-else/f.pdf`])).rejects.toThrow(/invalid file/);
      await q(`insert into storage.objects (bucket_id, name) values ('classroom', $1)`, [`${SCHOOL_A}/submissions/${a.id}/${childId}/work.pdf`]);
      await expect(q(`insert into storage.objects (bucket_id, name) values ('classroom', $1)`, [`${SCHOOL_A}/materials/x.pdf`])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("digital library", () => {
  it("only library managers add resources; students see student-facing items", async () => {
    await asUserSteps(db, U.librarianA, async (q) => {
      await q(`insert into public.library_resources (school_id, title, kind, url) values ($1, 'Open maths textbook', 'ebook', 'https://example.org/book'), ($1, 'Teacher guide', 'document', 'https://example.org/guide')`, [SCHOOL_A]);
      await q(`update public.library_resources set audience = 'staff' where title = 'Teacher guide'`);
      await expect(q(`insert into public.library_resources (school_id, title, kind, url, source) values ($1, 'Past papers', 'past_questions', 'https://example.org/p', 'licensed_official')`, [SCHOOL_A])).rejects.toThrow(/check constraint/);
      await as(q, U.teacherA);
      await expect(q(`insert into public.library_resources (school_id, title, kind, url) values ($1, 'X', 'link', 'https://x.org')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
      expect((await q(`select id from public.library_resources`)).length).toBe(2);
      await as(q, U.studentA);
      expect((await q<{ title: string }>(`select title from public.library_resources`)).map((r) => r.title)).toEqual(["Open maths textbook"]);
      await as(q, U.headB);
      expect((await q(`select id from public.library_resources`)).length).toBe(0);
    });
  });
});

describe("question bank and online exams", () => {
  async function setupExam(q: (s: string, p?: unknown[]) => Promise<{ [k: string]: unknown }[]>, opts: { opensIn?: string } = {}) {
    const [mcq] = await q(`insert into public.questions (school_id, subject_id, type, prompt, options, answer, marks) values ($1, $2, 'mcq', '2 + 2 = ?', '[{"id":"a","text":"3"},{"id":"b","text":"4"}]', '{"correct":"b"}', 2) returning id`, [SCHOOL_A, mathsId]);
    const [short] = await q(`insert into public.questions (school_id, subject_id, type, prompt, answer, marks) values ($1, $2, 'short_answer', 'Name a prime below 3', '{"accepted":["2", "two"]}', 1) returning id`, [SCHOOL_A, mathsId]);
    const [essay] = await q(`insert into public.questions (school_id, subject_id, type, prompt, answer, marks) values ($1, $2, 'essay', 'Explain fractions', '{"guide":"parts of a whole"}', 5) returning id`, [SCHOOL_A, mathsId]);
    const [exam] = await q(
      `insert into public.exams (school_id, term_id, class_id, subject_id, title, duration_minutes, opens_at, closes_at, is_published) values ($1, $2, $3, $4, 'Maths quiz', 30, now() + $5::interval, now() + interval '2 hours', true) returning id`,
      [SCHOOL_A, termId, classX, mathsId, opts.opensIn ?? "-1 hour"],
    );
    let pos = 1;
    for (const qq of [mcq, short, essay]) await q(`insert into public.exam_questions (school_id, exam_id, question_id, position, marks) select $1, $2, id, $3, marks from public.questions where id = $4`, [SCHOOL_A, exam.id, pos++, qq.id]);
    return { examId: exam.id as string, mcqId: mcq.id as string };
  }

  it("students can never read the question bank or answer keys", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      await setupExam(q);
      await as(q, U.studentA);
      expect((await q(`select id from public.questions`)).length).toBe(0);
      expect((await q(`select id from public.exam_questions`)).length).toBe(0);
      await as(q, U.idleTeacherA);
      expect((await q(`select id from public.questions`)).length).toBe(0);
    });
  });

  it("rejects malformed questions and unlabelled 'official' past questions", async () => {
    await expect(asUser(db, U.teacherA, `insert into public.questions (school_id, subject_id, type, prompt, options, answer) values ($1, $2, 'mcq', 'Q?', '[{"id":"a","text":"x"},{"id":"b","text":"y"}]', '{}')`, [SCHOOL_A, mathsId])).rejects.toThrow(/check constraint/);
    await expect(asUser(db, U.teacherA, `insert into public.questions (school_id, subject_id, type, prompt, answer, source) values ($1, $2, 'true_false', 'Q?', '{"correct":true}', 'licensed_past_question')`, [SCHOOL_A, mathsId])).rejects.toThrow(/check constraint/);
    await expect(asUser(db, U.teacherA, `insert into public.questions (school_id, subject_id, type, prompt, answer) values ($1, $2, 'true_false', 'Q?', '{"correct":true}')`, [SCHOOL_A, physicsId])).rejects.toThrow(/row-level security/);
  });

  it("runs an exam end to end: paper without answers, auto-marking, manual marking, release, review", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const { examId } = await setupExam(q);
      await as(q, U.studentY);
      await expect(q(`select public.start_exam($1)`, [examId])).rejects.toThrow(/not available/);

      await as(q, U.studentA);
      const [{ a }] = await q<{ a: string }>(`select public.start_exam($1) as a`, [examId]);
      const [{ p }] = await q<{ p: { questions: { id: string; type: string; options: unknown }[] } }>(`select public.exam_paper($1) as p`, [a]);
      expect(p.questions).toHaveLength(3);
      expect(JSON.stringify(p)).not.toMatch(/"correct"|"accepted"|"guide"|"answer"/);
      const byType = Object.fromEntries(p.questions.map((x) => [x.type, x.id]));
      await q(`select public.save_exam_answer($1, $2, '{"choice":"b"}')`, [a, byType.mcq]);
      await q(`select public.save_exam_answer($1, $2, '{"text":"  TWO "}')`, [a, byType.short_answer]);
      await q(`select public.save_exam_answer($1, $2, '{"text":"A fraction is part of a whole."}')`, [a, byType.essay]);
      await expect(q(`select id from public.exam_answers`)).resolves.toEqual([]);
      await expect(q(`select public.exam_review($1)`, [a])).rejects.toThrow(/not been released/);

      await as(q, U.classmateA);
      await expect(q(`select public.exam_paper($1)`, [a])).rejects.toThrow(/permission denied/);
      await expect(q(`select public.save_exam_answer($1, $2, '{"choice":"a"}')`, [a, byType.mcq])).rejects.toThrow(/permission denied/);

      await as(q, U.studentA);
      await q(`select public.submit_exam($1)`, [a]);
      await expect(q(`select public.save_exam_answer($1, $2, '{"choice":"a"}')`, [a, byType.mcq])).rejects.toThrow(/has been submitted/);
      const [att] = await q<{ status: string; auto_score: string; max_score: string }>(`select status, auto_score, max_score from public.exam_attempts`);
      expect([att.status, Number(att.auto_score), Number(att.max_score)]).toEqual(["submitted", 3, 8]);

      await as(q, U.teacherA);
      await expect(q(`select public.release_exam_results($1, true)`, [examId])).rejects.toThrow(/Finish marking/);
      await expect(q(`update public.questions set prompt = 'changed' where type = 'mcq'`)).rejects.toThrow(/can no longer be changed/);
      const [essayAns] = await q<{ id: string }>(`select id from public.exam_answers where needs_marking`);
      await expect(q(`select public.mark_exam_answer($1, 9)`, [essayAns.id])).rejects.toThrow(/between 0 and 5/);
      await q(`select public.mark_exam_answer($1, 4, 'Clear')`, [essayAns.id]);
      const [marked] = await q<{ status: string; total_score: string }>(`select status, total_score from public.exam_attempts`);
      expect([marked.status, Number(marked.total_score)]).toEqual(["marked", 7]);
      await q(`select public.release_exam_results($1, true)`, [examId]);

      const [{ assessment }] = await q<{ assessment: string }>(`select public.record_exam_in_results($1, 20) as assessment`, [examId]);
      const [score] = await q<{ score: string }>(`select score from public.assessment_scores where assessment_id = $1`, [assessment]);
      expect(Number(score.score)).toBe(7);

      await as(q, U.studentA);
      const [{ r }] = await q<{ r: { total_score: number; questions: { is_correct: boolean | null }[] } }>(`select public.exam_review($1) as r`, [a]);
      expect(Number(r.total_score)).toBe(7);
      expect(r.questions.map((x) => x.is_correct)).toEqual([true, true, null]);
      await as(q, U.parentA);
      await expect(q(`select public.exam_review($1)`, [a])).resolves.toHaveLength(1);
    });
  });

  it("exams can't be started before opening, and expired attempts are closed automatically", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const { examId: later } = await setupExam(q, { opensIn: "1 hour" });
      await as(q, U.studentA);
      await expect(q(`select public.start_exam($1)`, [later])).rejects.toThrow(/not opened yet/);
    });
    await asUserSteps(db, U.teacherA, async (q) => {
      const { examId, mcqId } = await setupExam(q);
      const [eq] = await q<{ id: string }>(`select id from public.exam_questions where question_id = $1`, [mcqId]);
      await as(q, U.studentA);
      const [{ a }] = await q<{ a: string }>(`select public.start_exam($1) as a`, [examId]);
      await q("reset role");
      await q(`update public.exam_attempts set deadline_at = now() - interval '5 minutes' where id = $1`, [a]);
      await q("set local role authenticated");
      await expect(q(`select public.save_exam_answer($1, $2, '{"choice":"b"}')`, [a, eq.id])).rejects.toThrow(/Time is up/);
    });
  });
});

describe("student results", () => {
  it("returns a student's own published scores only, to them and their guardian", async () => {
    await asUserSteps(db, U.headA, async (q) => {
      const [a] = await q<{ id: string }>(`insert into public.assessments (school_id, term_id, class_id, subject_id, name, kind, max_score, weight) values ($1, $2, $3, $4, 'Test', 'class_test', 20, 50) returning id`, [SCHOOL_A, termId, classX, mathsId]);
      await q(`insert into public.assessment_scores (school_id, assessment_id, student_id, score) values ($1, $2, $3, 16)`, [SCHOOL_A, a.id, childId]);
      await as(q, U.studentA);
      expect(await q(`select * from public.student_term_results($1, $2)`, [childId, termId])).toEqual([]);
      await as(q, U.headA);
      await q(`select public.publish_results($1, $2)`, [termId, classX]);
      await as(q, U.studentA);
      const rows = await q<{ score: string; subject_name: string }>(`select subject_name, score from public.student_term_results($1, $2)`, [childId, termId]);
      expect(rows.map((r) => [r.subject_name, Number(r.score)])).toEqual([["Core Mathematics", 16]]);
      expect((await q(`select * from public.student_published_terms($1)`, [childId])).length).toBe(1);
      await as(q, U.parentA);
      expect((await q(`select * from public.student_term_results($1, $2)`, [childId, termId])).length).toBe(1);
      await as(q, U.classmateA);
      await expect(q(`select * from public.student_term_results($1, $2)`, [childId, termId])).rejects.toThrow(/permission denied/);
    });
  });
});
