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

## Unit tests (`tests/unit.test.ts`)
Validation (registration, auth, open-redirect guard), the config-driven resource engine, onboarding
step logic, role/navigation filtering, pagination and search sanitising.

## Not yet covered
End-to-end browser tests (Playwright) against a live Supabase project — Phase 7.
