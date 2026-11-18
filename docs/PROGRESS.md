# Development Roadmap & Progress

Status legend: ✅ done and tested · 🟡 partial · ⏳ not started

## Phase 1 — Foundation (current)

| Item | Status | Notes |
|---|---|---|
| Project setup (Next.js 15, TS strict, Tailwind v4) | ✅ | |
| Design system (navy/royal blue/gold tokens, light + dark, primitives) | ✅ | `src/app/globals.css`, `src/components/ui` |
| Authentication (register, confirm, login, reset, sign-out) | ✅ | Supabase Auth |
| Database architecture + multi-tenant infrastructure | ✅ | `supabase/migrations/20261117000001_foundation.sql` |
| RBAC (platform + school scopes, DB-enforced) | ✅ | |
| School registration → verification | ✅ | `/register-school`, `/platform/schools/[id]` |
| Onboarding wizard (branding, years/terms, programmes/classes, staff, settings, launch) | ✅ | step 8 (student import) arrives with Phase 2 |
| Platform administrator dashboard | ✅ | overview, schools, platform staff, audit log |
| School administrator dashboard | ✅ | overview, onboarding, academics setup, members, settings, audit |
| Public website | 🟡 | home, features, audience pages, pricing (live plans), directory, about, contact, legal. Help centre content in Phase 7 |
| RLS + unit tests | ✅ | `npm test` |
| Verified against a live Supabase project | ⏳ | needs project keys (see INSTALLATION.md) |

## Phase 2 — Core school management ⏳
Students (admission, profiles, CSV/Excel import with validation + duplicate detection, ID generation,
transfers, progression, graduation), staff/teachers, subject and class allocation, timetable engine
with conflict detection, attendance, grading schemes, results.

## Phase 3 — Learning management ⏳
Student and teacher portals, digital classroom, assignments, digital library, examinations and question bank.

## Phase 4 — AI intelligence ⏳
Central AI service layer (provider config, prompt versioning, token/cost tracking, per-school limits,
moderation), AI tutor with curriculum RAG + citations, teacher assistant (lesson plans, notes,
questions, marking assistant, report drafting — all human-approved), learning analytics.

## Phase 5 — Parents & operations ⏳
Parent portal (verified guardian links), fees and finance (GHS), boarding, library, inventory,
labs, clubs, transport, restricted health records, notification engine (in-app, email, SMS).

## Phase 6 — National platform ⏳
Full directory, aggregated national analytics, subscription engine with Paystack/Hubtel, sponsored
and subsidised plans, support tickets, integrations.

## Phase 7 — Production readiness ⏳
Security audit, performance, E2E tests (Playwright), backups/DR runbook, deployment, API/admin/user docs.
