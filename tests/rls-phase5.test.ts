import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, grantPlatformRole, type Db } from "./db-harness";

/** Phase 5 RLS: finance and online payments, boarding, library, inventory, health, family messages, notifications. */
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";
const SCHOOL_B = "a0000000-0000-4000-8000-000000000002";
const MATHS_TEACHER_STAFF = "e0000000-0000-4000-8000-000000000001";

const U = {
  financeAdmin: "14000000-0000-4000-8000-000000000001",
  headA: "24000000-0000-4000-8000-000000000001",
  accountantA: "24000000-0000-4000-8000-000000000002",
  teacherA: "24000000-0000-4000-8000-000000000003",
  idleTeacherA: "24000000-0000-4000-8000-000000000004",
  housemasterA: "24000000-0000-4000-8000-000000000005",
  librarianA: "24000000-0000-4000-8000-000000000006",
  storekeeperA: "24000000-0000-4000-8000-000000000007",
  nurseA: "24000000-0000-4000-8000-000000000008",
  studentA: "24000000-0000-4000-8000-000000000009",
  parentA: "24000000-0000-4000-8000-00000000000a",
  otherParentA: "24000000-0000-4000-8000-00000000000b",
  headB: "34000000-0000-4000-8000-000000000001",
};

let db: Db;
let classX: string;
let termId: string;
let childId: string; // boarding? set below
let otherKidId: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const as = (q: (s: string, p?: unknown[]) => Promise<unknown[]>, user: string) => q(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);

beforeAll(async () => {
  db = await createDatabase();
  for (const [k, id] of Object.entries(U)) await createUser(db, id, `${k.toLowerCase()}@test.example`);
  await grantPlatformRole(db, U.financeAdmin, "finance_admin");
  const roles: [string, string][] = [
    [U.headA, "headteacher"], [U.accountantA, "accountant"], [U.teacherA, "teacher"], [U.idleTeacherA, "teacher"], [U.housemasterA, "housemaster"],
    [U.librarianA, "librarian"], [U.storekeeperA, "storekeeper"], [U.nurseA, "nurse"], [U.studentA, "student"], [U.parentA, "parent"], [U.otherParentA, "parent"],
  ];
  for (const [u, r] of roles) await addMember(db, SCHOOL_A, u, r);
  await addMember(db, SCHOOL_B, U.headB, "headteacher");
  await db.query(`update public.staff set user_id = $1 where id = $2`, [U.teacherA, MATHS_TEACHER_STAFF]);
  classX = (await one<{ id: string }>(`select id from public.school_classes where school_id = $1 and name = '1 Science A'`, [SCHOOL_A])).id;
  termId = (await one<{ id: string }>(`select id from public.academic_terms where school_id = $1 and is_current`, [SCHOOL_A])).id;
  const inX = (await db.query<{ id: string }>(`select id from public.students where class_id = $1 order by student_number`, [classX])).rows;
  childId = inX[0].id;
  otherKidId = inX[1].id;
  await db.query(`update public.students set user_id = $1, residency = 'boarding', gender = 'male' where id = $2`, [U.studentA, childId]);
  await db.query(`update public.students set residency = 'day' where id = $1`, [otherKidId]);
  const g1 = await one<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Parent A', '+233200000001', $2) returning id`, [SCHOOL_A, U.parentA]);
  const g2 = await one<{ id: string }>(`insert into public.guardians (school_id, full_name, phone, user_id) values ($1, 'Parent B', '+233200000002', $2) returning id`, [SCHOOL_A, U.otherParentA]);
  await db.query(`insert into public.student_guardians (school_id, student_id, guardian_id, relationship) values ($1, $2, $3, 'mother'), ($1, $4, $5, 'father')`, [SCHOOL_A, childId, g1.id, otherKidId, g2.id]);
});

describe("finance", () => {
  it("fees and invoices are hidden from teachers and other schools", async () => {
    expect((await asUser(db, U.teacherA, `select id from public.fee_items`)).length).toBe(0);
    expect((await asUser(db, U.headB, `select id from public.fee_items`)).length).toBe(0);
    expect((await asUser(db, U.accountantA, `select id from public.fee_items`)).length).toBe(3);
    await expect(asUser(db, U.headA, `insert into public.fee_items (school_id, name, amount) values ($1, 'X', 10)`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
  });

  it("invoices are generated from applicable fees, payments go through RPCs, and balances update", async () => {
    await asUserSteps(db, U.accountantA, async (q) => {
      const [{ n }] = await q<{ n: number }>(`select public.generate_term_invoices($1, $2) as n`, [termId, classX]);
      expect(n).toBe(8);
      const [{ again }] = await q<{ again: number }>(`select public.generate_term_invoices($1, $2) as again`, [termId, classX]);
      expect(again).toBe(0); // no duplicates
      const [inv] = await q<{ id: string; total: string; invoice_number: string }>(`select id, total, invoice_number from public.student_invoices where student_id = $1`, [childId]);
      expect(Number(inv.total)).toBe(430); // boarding child: 50 + 80 + 300
      const [day] = await q<{ total: string }>(`select total from public.student_invoices where student_id = $1`, [otherKidId]);
      expect(Number(day.total)).toBe(130);
      expect(inv.invoice_number).toMatch(/^INV-\d{2}-000001$|^INV-\d{2}-0000\d\d$/);

      await expect(q(`insert into public.student_payments (school_id, student_id, invoice_id, amount, method, receipt_number) values ($1, $2, $3, 10, 'cash', 'X')`, [SCHOOL_A, childId, inv.id])).rejects.toThrow(/permission denied/);
      const [{ p }] = await q<{ p: string }>(`select public.record_payment($1, 100, 'mobile_money', 'MOMO123') as p`, [inv.id]);
      const [after] = await q<{ status: string; amount_paid: string }>(`select status, amount_paid from public.student_invoices where id = $1`, [inv.id]);
      expect([after.status, Number(after.amount_paid)]).toEqual(["partially_paid", 100]);
      const [rec] = await q<{ receipt_number: string }>(`select receipt_number from public.student_payments where id = $1`, [p]);
      expect(rec.receipt_number).toMatch(/^RCT-\d{2}-\d{6}$/);
      await q(`select public.add_invoice_line($1, 'Scholarship', -330)`, [inv.id]);
      const [paid] = await q<{ status: string }>(`select status from public.student_invoices where id = $1`, [inv.id]);
      expect(paid.status).toBe("paid");
      await expect(q(`select public.cancel_invoice($1, 'error')`, [inv.id])).rejects.toThrow(/Reverse this invoice/);

      await as(q, U.headA);
      await expect(q(`select public.record_payment($1, 10, 'cash')`, [inv.id])).rejects.toThrow(/permission denied/);
      expect((await q(`select id from public.student_payments`)).length).toBe(1);

      await as(q, U.parentA);
      expect((await q<{ id: string }>(`select id from public.student_invoices`)).map((r) => r.id)).toEqual([inv.id]);
      expect((await q(`select id from public.student_payments`)).length).toBe(1);
      expect((await q(`select id from public.invoice_lines`)).length).toBe(4);
      await as(q, U.otherParentA);
      expect((await q(`select id from public.student_payments`)).length).toBe(0);

      await as(q, U.accountantA);
      await expect(q(`select public.reverse_payment($1, '')`, [p])).rejects.toThrow(/reason is required/);
      await q(`select public.reverse_payment($1, 'Bounced')`, [p]);
      const [rev] = await q<{ status: string; amount_paid: string }>(`select status, amount_paid from public.student_invoices where id = $1`, [inv.id]);
      expect([rev.status, Number(rev.amount_paid)]).toEqual(["issued", 0]); // GH₵100 still owed after the scholarship
    });
  });

  it("online payments: platform enables them, guardians start intents, only the verified server completes them", async () => {
    await asUserSteps(db, U.accountantA, async (q) => {
      await q(`select public.generate_term_invoices($1, $2)`, [termId, classX]);
      const [inv] = await q<{ id: string }>(`select id from public.student_invoices where student_id = $1`, [childId]);
      await as(q, U.parentA);
      await expect(q(`select public.create_payment_intent($1, 50, 'ref-1')`, [inv.id])).rejects.toThrow(/does not accept online payments/);
      await as(q, U.headA);
      await expect(q(`select public.set_payment_settings($1, true, 'ACCT_abc')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
      await as(q, U.financeAdmin);
      await q(`select public.set_payment_settings($1, true, 'ACCT_abc123')`, [SCHOOL_A]);
      await as(q, U.otherParentA);
      await expect(q(`select public.create_payment_intent($1, 50, 'ref-x')`, [inv.id])).rejects.toThrow(/permission denied/);
      await as(q, U.parentA);
      await expect(q(`select public.create_payment_intent($1, 99999, 'ref-2')`, [inv.id])).rejects.toThrow(/between GH₵1 and the balance/);
      await q(`select public.create_payment_intent($1, 50, 'ref-3')`, [inv.id]);
      await expect(q(`select public.complete_online_payment('ref-3', 50, 'PSK-1')`)).rejects.toThrow(/permission denied/);

      await q("reset role");
      const [{ id1 }] = await q<{ id1: string }>(`select public.complete_online_payment('ref-3', 50, 'PSK-1') as id1`);
      const [{ id2 }] = await q<{ id2: string }>(`select public.complete_online_payment('ref-3', 50, 'PSK-1') as id2`);
      expect(id2).toBe(id1); // idempotent
      const [i] = await q<{ amount_paid: string }>(`select amount_paid from public.student_invoices where id = $1`, [inv.id]);
      expect(Number(i.amount_paid)).toBe(50);
    });
  });
});

describe("boarding", () => {
  it("allocates beds with capacity, residency and gender checks", async () => {
    await asUserSteps(db, U.housemasterA, async (q) => {
      const [boys] = await q<{ id: string }>(`select r.id from public.dorm_rooms r join public.dormitories d on d.id = r.dormitory_id where d.gender = 'boys' and r.name = 'Room 1'`);
      const [girls] = await q<{ id: string }>(`select r.id from public.dorm_rooms r join public.dormitories d on d.id = r.dormitory_id where d.gender = 'girls'`);
      await expect(q(`insert into public.boarding_allocations (school_id, student_id, room_id) values ($1, $2, $3)`, [SCHOOL_A, otherKidId, boys.id])).rejects.toThrow(/Only boarding students/);
      await expect(q(`insert into public.boarding_allocations (school_id, student_id, room_id) values ($1, $2, $3)`, [SCHOOL_A, childId, girls.id])).rejects.toThrow(/girls only/);
      await q(`update public.dorm_rooms set beds = 1 where id = $1`, [boys.id]);
      await q(`insert into public.boarding_allocations (school_id, student_id, room_id, bed_label) values ($1, $2, $3, 'B1')`, [SCHOOL_A, childId, boys.id]);
      await q("reset role");
      const [{ id: other }] = await q<{ id: string }>(`select id from public.students where school_id = $1 and gender = 'male' and id <> $2 limit 1`, [SCHOOL_A, childId]);
      await q(`update public.students set residency = 'boarding' where id = $1`, [other]);
      await q("set local role authenticated");
      await expect(q(`insert into public.boarding_allocations (school_id, student_id, room_id) values ($1, $2, $3)`, [SCHOOL_A, other, boys.id])).rejects.toThrow(/room is full/);
      await as(q, U.parentA);
      expect((await q(`select id from public.boarding_allocations`)).length).toBe(1);
      await as(q, U.idleTeacherA);
      await expect(q(`insert into public.dormitories (school_id, name) values ($1, 'X')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("library lending", () => {
  it("prevents lending more copies than exist; students see their own loans", async () => {
    await asUserSteps(db, U.librarianA, async (q) => {
      const [book] = await q<{ id: string }>(`select id from public.library_books where title like 'Sample English%'`);
      await q(`insert into public.library_loans (school_id, book_id, student_id, due_on) values ($1, $2, $3, current_date + 14), ($1, $2, $4, current_date + 14)`, [SCHOOL_A, book.id, childId, otherKidId]);
      await expect(q(`insert into public.library_loans (school_id, book_id, staff_id, due_on) values ($1, $2, $3, current_date + 14)`, [SCHOOL_A, book.id, MATHS_TEACHER_STAFF])).rejects.toThrow(/All 2 copies are on loan/);
      await as(q, U.studentA);
      expect((await q(`select id from public.library_loans`)).length).toBe(1);
      const [maths] = await q<{ id: string }>(`select id from public.library_books where title like 'Sample Core%'`);
      await as(q, U.teacherA);
      await expect(q(`insert into public.library_loans (school_id, book_id, staff_id, due_on) values ($1, $2, $3, current_date + 7)`, [SCHOOL_A, maths.id, MATHS_TEACHER_STAFF])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("inventory and maintenance", () => {
  it("stock moves keep quantities honest and history append-only", async () => {
    await asUserSteps(db, U.storekeeperA, async (q) => {
      const [item] = await q<{ id: string }>(`select id from public.inventory_items where name like 'Chalk%'`);
      await q(`insert into public.inventory_transactions (school_id, item_id, kind, quantity) values ($1, $2, 'out', 5)`, [SCHOOL_A, item.id]);
      const [{ quantity }] = await q<{ quantity: string }>(`select quantity from public.inventory_items where id = $1`, [item.id]);
      expect(Number(quantity)).toBe(25);
      await expect(q(`insert into public.inventory_transactions (school_id, item_id, kind, quantity) values ($1, $2, 'out', 500)`, [SCHOOL_A, item.id])).rejects.toThrow(/Only 25 in stock/);
      await expect(q(`update public.inventory_items set quantity = 999 where id = $1`, [item.id])).rejects.toThrow(/permission denied/);
      await expect(q(`delete from public.inventory_transactions`)).rejects.toThrow(/permission denied/);
      await as(q, U.teacherA);
      expect((await q(`select id from public.inventory_items`)).length).toBe(0);
    });
  });

  it("any staff member can report a fault; storekeepers resolve it; students can't report", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const [r] = await q<{ id: string }>(`insert into public.maintenance_requests (school_id, location, description) values ($1, 'Science lab', 'Broken tap') returning id`, [SCHOOL_A]);
      await as(q, U.storekeeperA);
      expect((await q(`update public.maintenance_requests set status = 'done' where id = $1 returning id`, [r.id])).length).toBe(1);
      await as(q, U.studentA);
      await expect(q(`insert into public.maintenance_requests (school_id, location, description) values ($1, 'Dorm', 'Light')`, [SCHOOL_A])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("health records", () => {
  it("are visible to the nurse only; families see only shared clinic visits", async () => {
    await asUserSteps(db, U.nurseA, async (q) => {
      await q(`insert into public.health_records (school_id, student_id, allergies) values ($1, $2, 'Peanuts')`, [SCHOOL_A, childId]);
      await q(`insert into public.clinic_visits (school_id, student_id, complaint, share_with_guardian) values ($1, $2, 'Headache', true), ($1, $2, 'Private matter', false)`, [SCHOOL_A, childId]);
      for (const u of [U.headA, U.teacherA, U.accountantA, U.studentA]) {
        await as(q, u);
        expect((await q(`select id from public.health_records`)).length).toBe(0);
        expect((await q(`select id from public.clinic_visits`)).length).toBe(0);
      }
      await as(q, U.parentA);
      expect((await q<{ complaint: string }>(`select complaint from public.clinic_visits`)).map((v) => v.complaint)).toEqual(["Headache"]);
      expect((await q(`select id from public.health_records`)).length).toBe(0);
      await as(q, U.headA);
      await expect(q(`insert into public.health_records (school_id, student_id) values ($1, $2)`, [SCHOOL_A, otherKidId])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("family messages", () => {
  it("connect a child's guardians with the class's teachers only", async () => {
    await asUserSteps(db, U.parentA, async (q) => {
      await q(`insert into public.family_messages (school_id, student_id, from_family, body) values ($1, $2, true, 'Is there homework this week?')`, [SCHOOL_A, childId]);
      await expect(q(`insert into public.family_messages (school_id, student_id, from_family, body) values ($1, $2, false, 'Pretending to be staff')`, [SCHOOL_A, childId])).rejects.toThrow(/row-level security/);
      await expect(q(`insert into public.family_messages (school_id, student_id, from_family, body) values ($1, $2, true, 'Not my child')`, [SCHOOL_A, otherKidId])).rejects.toThrow(/row-level security/);
      await as(q, U.teacherA);
      expect((await q(`select id from public.family_messages`)).length).toBe(1);
      await q(`insert into public.family_messages (school_id, student_id, from_family, body) values ($1, $2, false, 'Yes, exercise 3.')`, [SCHOOL_A, childId]);
      await as(q, U.idleTeacherA);
      expect((await q(`select id from public.family_messages`)).length).toBe(0);
      await as(q, U.otherParentA);
      expect((await q(`select id from public.family_messages`)).length).toBe(0);
      await as(q, U.parentA);
      expect((await q(`select id from public.family_messages`)).length).toBe(2);
      await expect(q(`delete from public.family_messages`)).rejects.toThrow(/permission denied/);
    });
  });
});

describe("parent portal and notifications", () => {
  it("guardians see only their children's summaries", async () => {
    const kids = await asUser<{ student_id: string }>(db, U.parentA, `select student_id from public.guardian_children()`);
    expect(kids.map((k) => k.student_id)).toEqual([childId]);
    await expect(asUser(db, U.parentA, `select public.guardian_child_summary($1)`, [childId])).resolves.toHaveLength(1);
    await expect(asUser(db, U.otherParentA, `select public.guardian_child_summary($1)`, [childId])).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.teacherA, `select public.guardian_child_summary($1)`, [childId])).rejects.toThrow(/permission denied/);
  });

  it("preferences are per-user and the delivery outbox is server-only", async () => {
    await asUserSteps(db, U.parentA, async (q) => {
      await q(`insert into public.notification_preferences (sms_enabled, sms_phone) values (true, '+233241234567')`);
      await expect(q(`insert into public.notification_preferences (user_id, sms_enabled) values ($1, true)`, [U.otherParentA])).rejects.toThrow(/row-level security/);
      await expect(q(`update public.notification_preferences set sms_phone = '0241234567'`)).rejects.toThrow(/check constraint/);
      await expect(q(`select id from public.notification_outbox`)).rejects.toThrow(/permission denied/);
      await as(q, U.otherParentA);
      expect((await q(`select user_id from public.notification_preferences`)).length).toBe(0);
    });
  });
});
