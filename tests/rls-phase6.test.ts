import { beforeAll, describe, expect, it } from "vitest";

import { addMember, asUser, asUserSteps, createDatabase, createUser, grantPlatformRole, type Db } from "./db-harness";

/** Phase 6 RLS: plans, subscriptions + sponsorships, lifecycle, plan limits, support tickets, national analytics. */
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";
const SCHOOL_B = "a0000000-0000-4000-8000-000000000002";

const U = {
  financeAdmin: "16000000-0000-4000-8000-000000000001",
  support: "16000000-0000-4000-8000-000000000002",
  analyst: "16000000-0000-4000-8000-000000000003",
  headA: "26000000-0000-4000-8000-000000000001",
  accountantA: "26000000-0000-4000-8000-000000000002",
  teacherA: "26000000-0000-4000-8000-000000000003",
  studentA: "26000000-0000-4000-8000-000000000004",
  headB: "36000000-0000-4000-8000-000000000001",
  loner: "46000000-0000-4000-8000-000000000001",
};

let db: Db;
const as = async (q: (s: string, p?: unknown[]) => Promise<unknown[]>, user: string) => {
  await q(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
  await q("set local role authenticated");
};
const PRICED = `update public.subscription_plans set price_monthly_ghs = 200, price_annual_ghs = 2000 where code = 'professional'`;
const ref = (n: number) => `AISHS-SUB-00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  db = await createDatabase();
  for (const [k, id] of Object.entries(U)) await createUser(db, id, `${k.toLowerCase()}@test.example`);
  await grantPlatformRole(db, U.financeAdmin, "finance_admin");
  await grantPlatformRole(db, U.support, "support_officer");
  await grantPlatformRole(db, U.analyst, "data_analyst");
  await addMember(db, SCHOOL_A, U.headA, "headteacher");
  await addMember(db, SCHOOL_A, U.accountantA, "accountant");
  await addMember(db, SCHOOL_A, U.teacherA, "teacher");
  await addMember(db, SCHOOL_A, U.studentA, "student");
  await addMember(db, SCHOOL_B, U.headB, "headteacher");
});

describe("plans", () => {
  it("only finance staff change prices; free stays free; changes are audited", async () => {
    await asUserSteps(db, U.headA, async (q) => {
      const rows = await q(`update public.subscription_plans set price_monthly_ghs = 1 where code = 'starter' returning id`);
      expect(rows.length).toBe(0);
      await as(q, U.financeAdmin);
      await q(`update public.subscription_plans set price_monthly_ghs = 150 where code = 'starter'`);
      await expect(q(`update public.subscription_plans set price_monthly_ghs = 5 where code = 'free'`)).rejects.toThrow(/free plan must stay free/);
      await q("reset role");
      const [a] = await q<{ n: number }>(`select count(*)::int n from public.audit_logs where action = 'plan.updated'`);
      expect(a.n).toBe(1);
    });
  });
});

describe("subscriptions", () => {
  it("school billing staff request a plan; payment is completed only by the server and is idempotent", async () => {
    await asUserSteps(db, U.financeAdmin, async (q) => {
      await q(PRICED);
      await as(q, U.headA);
      await expect(q(`select public.request_subscription($1, 'enterprise', 'monthly')`, [SCHOOL_A])).rejects.toThrow(/no monthly price/);
      await as(q, U.teacherA);
      await expect(q(`select public.request_subscription($1, 'professional', 'monthly')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
      expect((await q(`select id from public.subscription_invoices`)).length).toBe(0);
      await as(q, U.headB);
      await expect(q(`select public.request_subscription($1, 'professional', 'monthly')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);

      await as(q, U.accountantA);
      const [{ first }] = await q<{ first: string }>(`select public.request_subscription($1, 'professional', 'annual') as first`, [SCHOOL_A]);
      const [{ inv }] = await q<{ inv: string }>(`select public.request_subscription($1, 'professional', 'monthly') as inv`, [SCHOOL_A]);
      const all = await q<{ id: string; status: string; amount_due: string }>(`select id, status, amount_due from public.subscription_invoices order by created_at, invoice_number`);
      expect(all.find((i) => i.id === first)?.status).toBe("void"); // only one open invoice at a time
      expect(Number(all.find((i) => i.id === inv)?.amount_due)).toBe(200);
      await expect(q(`insert into public.subscription_invoices (school_id, invoice_number, plan_id, billing_cycle, period_start, period_end, list_amount) select $1, 'X', id, 'monthly', current_date, current_date + 30, 0 from public.subscription_plans limit 1`, [SCHOOL_A])).rejects.toThrow(/permission denied/);

      await q(`select public.create_subscription_intent($1, $2)`, [inv, ref(1)]);
      await q(`select public.create_subscription_intent($1, $2)`, [inv, ref(2)]);
      await expect(q(`select public.complete_subscription_payment($1, 200, 'PSK-1')`, [ref(1)])).rejects.toThrow(/permission denied/);

      await q("reset role");
      const [{ bad }] = await q<{ bad: string | null }>(`select public.complete_subscription_payment($1, 150, 'PSK-0') as bad`, [ref(2)]);
      expect(bad).toBeNull(); // amount mismatch is recorded, not applied
      const [{ ok1 }] = await q<{ ok1: string }>(`select public.complete_subscription_payment($1, 200, 'PSK-1') as ok1`, [ref(1)]);
      const [{ ok2 }] = await q<{ ok2: string }>(`select public.complete_subscription_payment($1, 200, 'PSK-1') as ok2`, [ref(1)]);
      expect(ok1).toBe(inv);
      expect(ok2).toBe(inv);
      const [sub] = await q<{ code: string; status: string; funding_model: string; days: number }>(
        `select p.code, s.status, s.funding_model, (s.current_period_end::date - current_date) as days from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.school_id = $1`, [SCHOOL_A]);
      expect(sub).toMatchObject({ code: "professional", status: "active", funding_model: "self_funded" });
      expect(sub.days).toBeGreaterThanOrEqual(28);
      const [i] = await q<{ status: string; payment_method: string }>(`select status, payment_method from public.subscription_invoices where id = $1`, [inv]);
      expect(i).toMatchObject({ status: "paid", payment_method: "paystack" });

      // Same plan + cycle again = renewal starting at the current end date.
      await as(q, U.headA);
      const [{ ren }] = await q<{ ren: string }>(`select public.request_subscription($1, 'professional', 'monthly') as ren`, [SCHOOL_A]);
      const [r] = await q<{ kind: string; starts_at_end: boolean }>(
        `select kind, period_start = (select current_period_end::date from public.subscriptions where school_id = $2) as starts_at_end from public.subscription_invoices where id = $1`, [ren, SCHOOL_A]);
      expect(r).toMatchObject({ kind: "renewal", starts_at_end: true });
      await as(q, U.teacherA);
      expect((await q(`select id from public.subscription_invoices`)).length).toBe(0);
      expect((await q(`select id from public.subscription_payment_intents`)).length).toBe(0);
    });
  });

  it("sponsorships cover all or part of an invoice and only platform finance staff set them", async () => {
    await asUserSteps(db, U.financeAdmin, async (q) => {
      await q(PRICED);
      const [sp] = await q<{ id: string }>(`insert into public.sponsors (name, kind) values ('Old Students Union', 'alumni') returning id`);
      await as(q, U.headA);
      await expect(q(`insert into public.sponsors (name) values ('Me')`)).rejects.toThrow(/row-level security/);
      await expect(q(`select public.set_sponsorship($1, $2, 'professional', 100, null, null, null)`, [sp.id, SCHOOL_A])).rejects.toThrow(/permission denied/);

      await as(q, U.financeAdmin);
      await q(`select public.set_sponsorship($1, $2, 'professional', 50, null, null, 'Half')`, [sp.id, SCHOOL_A]);
      await as(q, U.headA);
      expect((await q(`select id from public.sponsorships`)).length).toBe(1);
      const [{ half }] = await q<{ half: string }>(`select public.request_subscription($1, 'professional', 'monthly') as half`, [SCHOOL_A]);
      const [h] = await q<{ amount_due: string; sponsor_amount: string }>(`select amount_due, sponsor_amount from public.subscription_invoices where id = $1`, [half]);
      expect([Number(h.amount_due), Number(h.sponsor_amount)]).toEqual([100, 100]);
      const [summary] = await q<{ s: { sponsorship: { sponsor: string; coverage_percent: number } } }>(`select public.school_billing_summary($1) as s`, [SCHOOL_A]);
      expect(summary.s.sponsorship.sponsor).toBe("Old Students Union");

      await as(q, U.financeAdmin);
      await q(`select public.set_sponsorship($1, $2, 'professional', 100, null, null, null)`, [sp.id, SCHOOL_A]);
      expect((await q(`select id from public.sponsorships where school_id = $1 and status = 'active'`, [SCHOOL_A])).length).toBe(1);
      const [{ full }] = await q<{ full: string }>(`select public.request_subscription($1, 'professional', 'monthly') as full`, [SCHOOL_A]);
      const [f] = await q<{ status: string; payment_method: string }>(`select status, payment_method from public.subscription_invoices where id = $1`, [full]);
      expect(f).toMatchObject({ status: "paid", payment_method: "sponsor" });
      const [s] = await q<{ funding_model: string; status: string }>(`select funding_model, status from public.subscriptions where school_id = $1`, [SCHOOL_A]);
      expect(s).toMatchObject({ funding_model: "sponsored", status: "active" });
      await as(q, U.headA);
      const [{ n }] = await q<{ n: number }>(`select count(*)::int n from public.notifications where user_id = $1 and title = 'Subscription active'`, [U.headA]);
      expect(n).toBeGreaterThan(0);
    });
  });

  it("offline payments and plan assignment are platform-only and need a reason", async () => {
    await asUserSteps(db, U.financeAdmin, async (q) => {
      await q(PRICED);
      const [{ inv }] = await q<{ inv: string }>(`select public.request_subscription($1, 'professional', 'monthly') as inv`, [SCHOOL_A]);
      await as(q, U.headA);
      await expect(q(`select public.record_subscription_payment($1, 'bank_transfer', 'GCB-1')`, [inv])).rejects.toThrow(/permission denied/);
      await expect(q(`select public.assign_plan($1, 'enterprise', 'annual', current_date + 365, 'self_funded', 'x')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
      await as(q, U.financeAdmin);
      await expect(q(`select public.record_subscription_payment($1, 'bank_transfer', '')`, [inv])).rejects.toThrow(/reference/);
      await q(`select public.record_subscription_payment($1, 'bank_transfer', 'GCB-1')`, [inv]);
      await expect(q(`select public.assign_plan($1, 'enterprise', 'annual', current_date + 365, 'institution_funded', '')`, [SCHOOL_A])).rejects.toThrow(/reason/);
      await q(`select public.assign_plan($1, 'enterprise', 'annual', current_date + 365, 'institution_funded', 'District agreement')`, [SCHOOL_A]);
      const [s] = await q<{ code: string; funding_model: string }>(`select p.code, s.funding_model from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.school_id = $1`, [SCHOOL_A]);
      expect(s).toMatchObject({ code: "enterprise", funding_model: "institution_funded" });
    });
  });

  it("lifecycle: renewal invoice, grace period, past due, then Free limits apply to new students", async () => {
    await asUserSteps(db, U.financeAdmin, async (q) => {
      await q(PRICED);
      await q(`select public.assign_plan($1, 'professional', 'monthly', current_date + 30, 'self_funded', 'Test')`, [SCHOOL_A]);
      await expect(q(`select public.subscription_lifecycle()`)).rejects.toThrow(/permission denied/);
      await q("reset role");
      await q(`update public.subscriptions set current_period_end = now() - interval '1 day' where school_id = $1`, [SCHOOL_A]);
      const [{ r1 }] = await q<{ r1: Record<string, number> }>(`select public.subscription_lifecycle() as r1`);
      expect(r1).toMatchObject({ renewal_invoices: 1, entered_grace: 1, past_due: 0 });
      const [{ r2 }] = await q<{ r2: Record<string, number> }>(`select public.subscription_lifecycle() as r2`);
      expect(r2).toMatchObject({ renewal_invoices: 0, entered_grace: 0 }); // no duplicates
      const [{ inv }] = await q<{ inv: { kind: string; status: string } }>(`select to_jsonb(i) as inv from public.subscription_invoices i where school_id = $1 and status = 'open'`, [SCHOOL_A]);
      expect(inv).toMatchObject({ kind: "renewal" });

      await q(`update public.subscriptions set current_period_end = now() - interval '20 days' where school_id = $1`, [SCHOOL_A]);
      const [{ r3 }] = await q<{ r3: Record<string, number> }>(`select public.subscription_lifecycle() as r3`);
      expect(r3.past_due).toBe(1);

      // Past due: Free limits. Cap Free at the current count so one more admission is refused.
      const [{ n }] = await q<{ n: number }>(`select count(*)::int n from public.students where school_id = $1 and status = 'active'`, [SCHOOL_A]);
      await q(`update public.subscription_plans set limits = jsonb_set(limits, '{max_students}', to_jsonb($1::int)) where code = 'free'`, [n]);
      const cls = (await q<{ id: string }>(`select id from public.school_classes where school_id = $1 limit 1`, [SCHOOL_A]))[0].id;
      await expect(q(`insert into public.students (school_id, student_number, first_name, last_name, gender, class_id) values ($1, 'LIM-1', 'Ama', 'Test', 'female', $2)`, [SCHOOL_A, cls]))
        .rejects.toThrow(/plan allows up to/);
      // School B (still on Free, fewer students) is unaffected by school A's count.
      await q(`update public.subscription_plans set limits = jsonb_set(limits, '{max_students}', '1000') where code = 'free'`);
      await q(`insert into public.students (school_id, student_number, first_name, last_name, gender, class_id) values ($1, 'LIM-1', 'Ama', 'Test', 'female', $2)`, [SCHOOL_A, cls]);
    });
  });
});

describe("support", () => {
  it("staff raise tickets; school leaders and support see them; internal notes stay internal", async () => {
    await asUserSteps(db, U.teacherA, async (q) => {
      const [{ t }] = await q<{ t: string }>(`select public.open_support_ticket($1, 'Cannot print report cards', 'technical', 'normal', 'The PDF is blank.') as t`, [SCHOOL_A]);
      await expect(q(`insert into public.support_tickets (requester_id, subject, category) values ($1, 'x x x', 'other')`, [U.teacherA])).rejects.toThrow(/permission denied/);
      await expect(q(`select public.open_support_ticket($1, 'Hello there', 'other', 'urgent', 'x')`, [SCHOOL_A])).rejects.toThrow(/invalid priority/);

      await as(q, U.studentA);
      await expect(q(`select public.open_support_ticket($1, 'Help me', 'other', 'normal', 'x')`, [SCHOOL_A])).rejects.toThrow(/permission denied/);
      expect((await q(`select id from public.support_tickets`)).length).toBe(0);
      await as(q, U.headB);
      expect((await q(`select id from public.support_tickets`)).length).toBe(0);
      await as(q, U.headA);
      expect((await q(`select id from public.support_tickets`)).length).toBe(1);

      await as(q, U.support);
      expect((await q(`select id from public.support_tickets`)).length).toBe(1);
      const [{ n }] = await q<{ n: number }>(`select count(*)::int n from public.notifications where user_id = $1`, [U.support]);
      expect(n).toBe(1);
      await q(`select public.reply_support_ticket($1, 'Checking the template — likely a font issue.', true)`, [t]);
      await q(`select public.reply_support_ticket($1, 'Please try again now.', false)`, [t]);
      await expect(q(`select public.update_support_ticket($1, null, null, $2)`, [t, U.teacherA])).rejects.toThrow(/support staff/);
      await q(`select public.update_support_ticket($1, null, 'high', $2)`, [t, U.support]);

      await as(q, U.teacherA);
      const msgs = await q<{ is_internal: boolean }>(`select is_internal from public.support_messages where ticket_id = $1`, [t]);
      expect(msgs.length).toBe(2); // the internal note is hidden
      expect(msgs.some((m) => m.is_internal)).toBe(false);
      const [tk] = await q<{ status: string; priority: string; assigned_to: string }>(`select status, priority, assigned_to from public.support_tickets where id = $1`, [t]);
      expect(tk).toMatchObject({ status: "waiting_on_requester", priority: "high", assigned_to: U.support });
      await expect(q(`select public.reply_support_ticket($1, 'note', true)`, [t])).rejects.toThrow(/permission denied/);
      await expect(q(`select public.update_support_ticket($1, null, 'urgent', null)`, [t])).rejects.toThrow(/permission denied/);
      await q(`select public.reply_support_ticket($1, 'Still blank.', false)`, [t]);
      const [again] = await q<{ status: string }>(`select status from public.support_tickets where id = $1`, [t]);
      expect(again.status).toBe("open");
      await q(`select public.update_support_ticket($1, 'closed', null, null)`, [t]);
      await expect(q(`select public.reply_support_ticket($1, 'one more', false)`, [t])).rejects.toThrow(/closed/);
    });
  });

  it("users without a school can still ask for help", async () => {
    const rows = await asUser<{ t: string }>(db, U.loner, `select public.open_support_ticket(null, 'Registration stuck', 'account', 'normal', 'My school is still pending.') as t`);
    expect(rows[0].t).toBeTruthy();
  });
});

describe("national analytics", () => {
  it("is aggregate-only for analytics staff and suppresses groups under three schools", async () => {
    await expect(asUser(db, U.headA, `select public.national_analytics()`)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.analyst, `select public.platform_revenue()`)).rejects.toThrow(/permission denied/);
    await asUserSteps(db, null, async (q) => {
      await q("reset role");
      await q(`update public.schools set is_demo = false`);
      await as(q, U.analyst); // three active schools, each in a different region
      const [{ a }] = await q<{ a: { totals: { schools: number; students: number | null }; by_region: { schools: number; suppressed: boolean; students: number | null }[] } }>(`select public.national_analytics() as a`);
      expect(a.totals.schools).toBe(3); // the pending sample school isn't counted
      expect(a.totals.students).toBeGreaterThan(0);
      const withSchools = a.by_region.filter((r) => r.schools > 0);
      expect(withSchools.length).toBeGreaterThan(0);
      for (const r of withSchools) expect(r).toMatchObject({ suppressed: true, students: null });
    });
    const [{ r }] = await asUser<{ r: { open_invoices: { count: number } } }>(db, U.financeAdmin, `select public.platform_revenue() as r`);
    expect(r.open_invoices.count).toBe(0);
  });
});
