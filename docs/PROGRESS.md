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
| Onboarding wizard (branding, years/terms, programmes/classes, staff, settings, launch) | ✅ | all 10 steps live since Phase 2 |
| Platform administrator dashboard | ✅ | overview, schools, platform staff, audit log |
| School administrator dashboard | ✅ | overview, onboarding, academics setup, members, settings, audit |
| Public website | 🟡 | home, features, audience pages, pricing (live plans), directory, about, contact, legal. Help centre content in Phase 7 |
| RLS + unit tests | ✅ | `npm test` |
| Verified against a live Supabase project | ⏳ | needs project keys (see INSTALLATION.md) |

## Phase 2 — Core school management ✅ (code-complete 2026-11-18)

| Item | Status | Notes |
|---|---|---|
| Student records (admission, profile, edit, auto student numbers) | ✅ | `/school/students` |
| Guardians, parent account linking, per-guardian record access | ✅ | parents see only linked children (RLS) |
| CSV import with validation, duplicate detection, preview before commit | ✅ | Excel → save as CSV; native .xlsx not yet supported |
| Transfers, withdrawal, suspension, class moves, promotion, graduation + history | ✅ | `change_student_status`, `promote_class` RPCs |
| Subject registration | ✅ | |
| Staff records, staff numbers, departments, employment status | ✅ | `/school/staff` |
| Teaching assignments (class × subject × periods/week) | ✅ | drive timetable generation **and** teacher permissions |
| Timetable: periods, grid by class/teacher, manual edit, automatic generation | ✅ | class/teacher/room clashes blocked by DB constraints |
| Attendance registers (teachers: own classes only), 7-day trend, dashboard card | ✅ | `/school/attendance` |
| Assessments + score entry (teachers: own subjects only) | ✅ | `/school/assessments` |
| Configurable grading schemes (no WAEC/GES scheme assumed) | ✅ | `/school/results/grading` |
| Results sheet (weighted totals, grades, positions), CSV export, publish/withdraw | ✅ | students/parents see scores only after publication |
| Onboarding step 8 (import students) | ✅ | |
| Leave management, staff documents, report cards (PDF) | ⏳ | moved to Phase 3/5 |
| Verified against a live Supabase project | ⏳ | needs project keys; Docker Desktop not running locally |

## Phase 3 — Learning management ✅ (code-complete 2026-11-19)

| Item | Status | Notes |
|---|---|---|
| Student portal (`/student`): today's lessons, due work, exams, announcements, attendance | ✅ | students are routed here automatically |
| Digital classroom: notes, video/web links, file uploads, drafts vs published | ✅ | private `classroom` bucket, signed links |
| Class and school-wide announcements (audience: all / staff / students) | ✅ | |
| Moderated class discussion (teachers hide/restore; hidden posts vanish for others) | ✅ | |
| Assignments: set, submit text or files, resubmit until marked, late rules, mark & feedback | ✅ | unsent drafts kept on the device |
| Digital library with honest provenance (school / open licence / licensed official) | ✅ | staff-only items supported |
| Question bank (MCQ, true/false, short answer, essay) with source labels | ✅ | answer keys never reach students |
| Online exams: timed, shuffled, autosave + offline retry, auto-marking, essay marking | ✅ | expired attempts closed automatically |
| Release results, student review with correct answers and feedback | ✅ | |
| Exam totals → term results (creates a Phase 2 assessment) | ✅ | |
| Student published results page | ✅ | via `student_term_results` RPC |
| Parent portal UI | ✅ | Phase 5 |
| Verified against a live Supabase project | ⏳ | needs project keys |

## Phase 4 — AI intelligence ✅ (code-complete 2026-11-20)

| Item | Status | Notes |
|---|---|---|
| Central AI service layer: OpenAI-compatible provider, env-configurable models, timeouts/retries, structured outputs | ✅ | `src/lib/ai/*`; no AI calls from components |
| Prompt versioning, token + cost tracking, per-school monthly allowance, per-student daily limit | ✅ | Free plan = 0 requests; platform staff set overrides |
| Curriculum knowledge base (PDF/text → chunks → pgvector), school-private + platform-wide, official/licence labels | ✅ | keyword search fallback when AI isn't configured |
| AI tutor: step-by-step teaching, citations, "general explanation" labelling, image questions, voice dictation | ✅ | `/student/tutor`; images never stored |
| Student safety: local checks + provider moderation, caring fixed reply, safeguarding alerts and review queue | ✅ | `/school/safeguarding` |
| Lesson planner, notes generator (→ unpublished classroom drafts) | ✅ | `/school/ai` |
| Question generator (teacher picks → bank, labelled AI-generated) | ✅ | |
| Marking assistant for essays and assignments (suggests; teacher decides) | ✅ | |
| Report comments: AI drafts from anonymised data, teacher approval, visible after publication | ✅ | `/school/report-comments` |
| Learning insights (support indicators, weak subjects/topics) + anonymised AI summary | ✅ | `/school/insights` |
| AI settings/usage (school) and AI usage/allowances (platform) | ✅ | |
| Streaming tutor replies | ⏳ | replies arrive whole; fine on low bandwidth |
| Verified against a live AI provider and Supabase | ⏳ | needs keys; client tested with mocked HTTP |

## Phase 5 — Parents & operations ✅ (code-complete 2026-11-21)

| Item | Status | Notes |
|---|---|---|
| Parent portal: children (verified guardian links only), attendance, work due, published results, fees, receipts | ✅ | `/parent`; parents are redirected there from `/school` |
| Parent ↔ school messages per child (class teachers + authorised staff) | ✅ | `/school/messages`, child page in the portal |
| Fees (GHS): fee items, term invoice generation, extra lines, cancel, record/reverse payments, numbered receipts | ✅ | `/school/finance`; totals recalculated in the database |
| Online fee payments via Paystack (Mobile Money/card) to the school's subaccount | ✅ | webhook + callback both re-verify with Paystack; idempotent |
| Expenditure and budgets | ✅ | |
| Boarding: dormitories, rooms, bed allocation (capacity, gender, boarders only) | ✅ | `/school/boarding` |
| Library lending: catalogue, issue/return, availability, overdue | ✅ | `/school/books` |
| Stores (stock in/out ledger), assets, maintenance requests | ✅ | `/school/inventory`, `/school/maintenance` |
| Health records and clinic visits — nurse/health staff only, every view audited | ✅ | `/school/health` |
| Notification engine: in-app + queued email (Resend) / SMS (Arkesel, Hubtel), per-user preferences | ✅ | cron `/api/cron/notifications` |
| Hooks: announcements, assignments, exams, results publication, absences, payments, messages | ✅ | |
| Labs, clubs, sports, transport, events | ⏳ | later (not needed for the core parent/finance loop) |
| Verified against live Supabase, Paystack and SMS/email providers | ⏳ | needs keys; Paystack/SMS clients tested with mocked HTTP |

Hosting note: Vercel Hobby runs crons at most once a day; use Pro (or an external scheduler calling the
cron URL with the bearer secret) for 10-minute email/SMS delivery.

## Phase 6 — National platform ⏳
Full directory, aggregated national analytics, subscription engine with Paystack/Hubtel, sponsored
and subsidised plans, support tickets, integrations.

## Phase 7 — Production readiness ⏳
Security audit, performance, E2E tests (Playwright), backups/DR runbook, deployment, API/admin/user docs.
