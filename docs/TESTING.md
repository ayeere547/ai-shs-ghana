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

## Unit tests (`tests/unit.test.ts`, `tests/phase2-unit.test.ts`)
Phase 2 adds: CSV parsing and import validation/duplicate detection, the timetable generator (no clashes, spreading, overload reporting, fixed slots), and results maths (weighting, incomplete subjects, grade boundaries, tied positions, safe CSV export).

## Phase 1 unit tests
Validation (registration, auth, open-redirect guard), the config-driven resource engine, onboarding
step logic, role/navigation filtering, pagination and search sanitising.

## Not yet covered
End-to-end browser tests (Playwright) against a live Supabase project — Phase 7.
