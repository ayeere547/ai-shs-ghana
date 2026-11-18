# AI SHS Ghana — Technical Architecture

## 1. Repository assessment

AI SHS Ghana is a **new standalone project** (`C:\ai-shs-ghana`). It is not built inside an existing
application, so nothing is overwritten. It reuses proven, framework-level pieces from the author's
other Next.js + Supabase platforms (Supabase SSR clients, the PGlite RLS test harness, UI primitives,
the migration runner). All domain code — schema, roles, flows, pages — is new.

## 2. System overview

```
Browser (Next.js RSC + small client islands)
   │  cookies (Supabase session)
   ▼
Next.js App Router (Vercel)
   ├─ middleware.ts ............ refreshes session, keeps signed-out users out of /app, /platform, /school
   ├─ Server Components ........ read data with the USER's Supabase client → RLS decides every row
   ├─ Server Actions ........... validate (zod) → permission guard → RPC / table write under RLS
   ├─ lib/supabase/admin.ts .... service-role client, ONLY for auth-admin operations (invites)
   └─ lib/ai/* (Phase 4) ....... central AI service layer: model config, prompt versions, cost tracking
   ▼
Supabase
   ├─ Auth ........................ email + password, email confirmation, password reset
   ├─ PostgreSQL + RLS ............ tenant isolation and RBAC enforced in the database
   ├─ SECURITY DEFINER RPCs ....... multi-step state changes (register school, verify, invite) + audit
   ├─ Storage (Phase 1: logos) .... bucket policies keyed on school_id path prefix
   └─ pgvector (Phase 4) .......... curriculum-aware RAG
```

### Layering rules

| Layer | Location | May depend on |
|---|---|---|
| UI components | `src/components/**` | nothing server-only |
| Pages / layouts | `src/app/**` | `lib/**`, components |
| Server actions | `src/app/**/actions.ts` | `lib/auth`, `lib/supabase/server`, `lib/validation` |
| Domain logic | `src/lib/<domain>/*` | `lib/supabase` |
| Database access | Supabase client (user session) | — |
| Privileged access | `lib/supabase/admin.ts` | only after `requirePlatformPermission` / `requireSchoolPermission` |
| AI (Phase 4+) | `src/lib/ai/*` | never imported by client components |

## 3. Multi-tenancy

* One shared PostgreSQL database. **Every school-owned row carries `school_id`.**
* Tenant isolation is enforced by **Row Level Security**, never by the UI:
  * `public.is_school_member(school_id)` — caller has an active membership in that school.
  * `public.has_school_permission(school_id, permission)` — caller's role in that school grants the
    permission **and** the school is `active` (pending/suspended schools are read-only).
* The browser never supplies an authoritative `school_id`. Server actions take the school from the
  signed-in user's verified memberships (`getSchoolContext()`); the optional "active school" cookie
  only *chooses between* memberships the server has already confirmed, and RLS re-checks every write.
* Composite foreign keys (`(programme_id, school_id) → school_programmes(id, school_id)`) make it
  impossible to link a row in School A to a parent row in School B, even through the API.
* A trigger forbids changing `school_id` on any tenant row after insert.
* Platform staff have **no** blanket read access to tenant rows. Cross-school views are aggregate RPCs
  (`platform_overview()`) or the `schools` registry itself, gated by explicit platform permissions,
  and every platform action is written to `audit_logs`.
* **Future migration path:** because all tenant data is keyed by `school_id` and no query joins across
  tenants, a large school can later be moved to its own database by copying `where school_id = X`
  from each tenant table (see `docs/DATABASE.md §Tenant extraction`).

## 4. Identity and RBAC

* `auth.users` → `profiles` (trigger). `profiles.status = 'suspended'` removes all access in RLS.
* Two role scopes in one catalogue (`roles.scope = 'platform' | 'school'`), with `permissions` and
  `role_permissions`:
  * **Platform:** super_admin, platform_admin, support_officer, finance_admin, data_analyst
    (assigned in `platform_users`).
  * **School:** headteacher, assistant_headteacher, academic_admin, school_admin, accountant,
    hr_officer, head_of_department, teacher, librarian, exam_officer, counsellor, housemaster,
    storekeeper, nurse, student, parent (assigned in `school_memberships`, one role per school).
* The app loads permissions to decide what to show; **the database independently enforces them**.
* Role assignment happens only through SECURITY DEFINER RPCs that check the caller's permission,
  block self-modification, and refuse to grant platform roles from school context.

## 5. Key flows (Phase 1)

1. **Account** — `/register` → email confirmation → `/app`.
2. **School registration** — `/register-school` → `register_school()` RPC creates the school in
   `pending_verification`, makes the registrant its `school_admin`, audits, and notifies platform
   reviewers.
3. **Verification** — platform staff with `schools.verify` approve or reject (`review_school()`).
   Approval activates the school and attaches the Free plan subscription.
4. **Onboarding wizard** — `/school/onboarding` steps 4–10 (branding, academic year/terms, programmes
   and classes, staff invitations, settings, launch). Steps 8 (student import) ships with Phase 2's
   student module and is shown as such.
5. **Suspension** — `set_school_status()` with `schools.suspend`; a suspended school becomes read-only
   for its members via `has_school_permission`.

## 6. Security posture (summary — see SECURITY.md)

RLS on every table, SECURITY DEFINER functions with `search_path = ''`, column-level grants for
mutable fields, server-side zod validation, rate-limited auth, POST-only sign-out, open-redirect-safe
`next` handling, strict security headers, no secrets in client bundles, append-only audit log.

## 7. Technology decisions

| Brief item | Decision | Reason |
|---|---|---|
| Next.js App Router, TS strict, Tailwind | Next.js 15.5, Tailwind v4 | as specified |
| shadcn/ui | Same pattern (owned, token-driven primitives in `components/ui`) without the CLI | avoids CLI scaffolding churn; components are copy-owned like shadcn |
| Recharts | used for dashboards | as specified |
| Supabase Auth/Postgres/Storage | as specified | — |
| OpenAI + pgvector | Phase 4, behind `lib/ai` provider interface | swappable models |
| Paystack / Hubtel | Phase 6, server-side verification + webhooks | as specified |
| Tests | Vitest + PGlite running the real migrations | RLS is tested without Docker |
