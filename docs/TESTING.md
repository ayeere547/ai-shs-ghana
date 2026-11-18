# Testing

```bash
npm test          # Vitest: RLS + unit tests
npm run typecheck
```

## RLS tests (`tests/rls.test.ts`)
Run the **real migrations** inside PGlite (in-process Postgres) with a small stub of Supabase's
`auth`/`storage` schemas, then execute SQL **as specific users** under the `authenticated`/`anon`
roles. Row Level Security alone decides each outcome. Covered:

* School A cannot read or write School B's records (including by supplying B's `school_id`, moving rows, or linking to B's parents rows).
* Platform administrators have no blanket access to tenant records.
* Teachers read but cannot change academic structure; students cannot list other members.
* Status, name and verification fields cannot be changed by schools; membership and platform-role tables cannot be written directly.
* Role escalation guards: no assigning above your own rank, no changing your own membership, no cross-school management.
* Suspended accounts and suspended/pending schools lose write access.
* Registration → verification → activation flow, reasons required for rejection/suspension, reviewer notifications.
* Audit log is append-only, scoped per school, and internal writer functions are not callable.
* Logo uploads restricted to the uploader's own school folder.
* Public directory/profile/stats expose only active, opted-in, non-sample data.

## Phase 2 RLS tests (`tests/rls-phase2.test.ts`)
* School B cannot read or create School A's students.
* A student sees only their own record and attendance; a parent sees only linked children, and loses access when it's paused.
* Teachers read students but can't edit them; HR manages staff but can't see students; students can't read the staff directory.
* Teachers take attendance and create assessments/scores only for classes and subjects they're assigned; scores above the maximum or for students outside the class are rejected.
* Students and parents see scores only after results are published; only `results.publish` holders can publish.
* The database rejects double-booking a teacher; teachers can't edit the timetable.
* Status history, promotion and graduation only through RPCs; account links (`user_id`) can't be written directly.

## Phase 3 RLS tests (`tests/rls-phase3.test.ts`)
* Materials only by the subject teacher; students see published items for their own class only.
* Announcements respect audience; teachers can't post school-wide; non-teaching staff can't post to a class.
* Discussion: students post only in their class and only as themselves; teachers hide posts; hidden posts vanish for classmates but not the author.
* Assignments: submissions only via RPC, resubmission until marked, late rules, marking limited to the subject teacher, parents see only returned work, students' files only in their own folder.
* Library: only library managers add items; staff-only items hidden from students; "licensed official" requires a licence note.
* Exams: students can never read the question bank; the paper contains no answer keys; other students can't read or answer someone's attempt; auto-marking; essay marking limits; release blocked until marked; questions frozen after use; exams can't start early; timed-out attempts close.
* Student results only after publication, for the student and their guardian.

## Phase 4 RLS tests (`tests/rls-phase4.test.ts`)
* Schools toggle AI but can't change their allowance; quota follows the plan, overrides and billable usage only.
* Usage logs can't be written by users; students see their own, AI admins their school's.
* Knowledge base: per-school isolation, platform-wide sharing, no smuggling chunks across schools, vector and keyword retrieval both respect RLS.
* Tutor: private conversations, no client-written messages or flag changes, safeguarding staff see only flagged messages.
* Drafts private to the author; report comments approved by the author, reset to draft on edit, visible to families only after publication.
* Insights for the class's teachers and results staff only.

## Phase 5 RLS tests (`tests/rls-phase5.test.ts`)
* Finance: staff without finance rights can't see invoices; invoice generation, totals, payments, reversals; guardians see only their children's invoices.
* Online payments: guardians create intents only for their children; only the server completes them; idempotent; amount mismatch rejected.
* Boarding capacity/gender/residency rules; library availability; stock only via the ledger; any staff can report faults.
* Health records hidden from teachers and families except shared visits.
* Family messages limited to the class's teachers, authorised staff and the child's guardians; no edits.
* Parent portal RPCs and notification preferences/outbox access.

## Phase 6 RLS tests (`tests/rls-phase6.test.ts`)
* Plans: only finance staff change prices; Free stays free; changes audited.
* Subscriptions: billing roles request plans, other roles/schools can't; one open invoice; server-only, idempotent completion; amount mismatch recorded not applied; renewals.
* Sponsorships: partial and full coverage, platform-only.
* Offline payments and plan assignment are platform-only with references/reasons.
* Lifecycle: renewal invoice once, grace, past due, Free student cap enforced.
* Support: who can open/see tickets, hidden internal notes, status flow, assignment rules, users without a school.
* National analytics: permission-gated, small groups suppressed; revenue for finance staff only.

## Phase 6 unit tests (`tests/phase6-unit.test.ts`)
Analytics CSV (suppression, formula injection), error-message filtering, Paystack checkout URL check, subscription payments without a subaccount, cron secret check.

## Notification and payment unit tests (`tests/notify-unit.test.ts`)
Channel preferences, Ghana phone normalising, SMS text, Arkesel/Hubtel/Resend requests (mocked HTTP), Paystack signature check and API calls.

## AI unit tests (`tests/ai-unit.test.ts`)
Client (request shape, structured output, retry/no-retry, truncation, missing key, embeddings, moderation) with mocked HTTP; chunking; source formatting and citation extraction; prompt rules; safety detection; cost estimates; draft → question-bank validation; pseudonymisation.

## Unit tests (`tests/unit.test.ts`, `tests/phase2-unit.test.ts`)
Phase 2 adds: CSV parsing and import validation/duplicate detection, the timetable generator (no clashes, spreading, overload reporting, fixed slots), and results maths (weighting, incomplete subjects, grade boundaries, tied positions, safe CSV export).

## Phase 1 unit tests
Validation (registration, auth, open-redirect guard), the config-driven resource engine, onboarding
step logic, role/navigation filtering, pagination and search sanitising.

## Not yet covered
End-to-end browser tests (Playwright) against a live Supabase project — Phase 7.
