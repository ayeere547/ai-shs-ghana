# Database Design

PostgreSQL (Supabase). UUID primary keys (`gen_random_uuid()`), `created_at`/`updated_at` timestamps,
RLS enabled on **every** table in `public`. Migrations live in `supabase/migrations` and are applied
in filename order (`supabase db push` or `npm run db:migrate`).

## Conventions

* Tenant tables: `school_id uuid not null references schools(id) on delete cascade`, index on
  `school_id`, `unique (id, school_id)` when other tenant tables reference them, composite FKs for
  child rows, `forbid_school_id_change` trigger.
* Policies on tenant tables follow one template:
  * `select` → `is_school_member(school_id)` (narrowed per table where data is sensitive — e.g.
    health records in Phase 5 use `has_school_permission(school_id,'health.read')`).
  * `insert/update/delete` → `has_school_permission(school_id, '<module>.manage')`.
* Soft deletion only where history matters (memberships use `status = 'removed'`; schools are never
  hard-deleted by the app). Audit log is append-only (no update/delete grants to anyone but the owner).
* Demo rows have `is_demo = true` and are visibly labelled in the UI.

## Phase 1 tables (implemented — `20261117000001_foundation.sql`)

| Group | Table | Notes |
|---|---|---|
| Platform | `platform_settings` | key/value config, platform-permission write |
| | `roles`, `permissions`, `role_permissions` | one catalogue for both scopes (`scope`). Covers the brief's `platform_roles` / `platform_permissions` |
| | `platform_users` | user → platform role |
| | `audit_logs` | append-only; covers `platform_audit_logs` and school-scoped audit (nullable `school_id`) |
| | `subscription_plans`, `subscriptions` | plans seeded (limits configurable JSON); Free subscription created on verification; billing in Phase 6 |
| Reference | `regions` | Ghana's 16 regions |
| Users | `profiles` | 1:1 with `auth.users` |
| Schools | `schools` | registry + verification status, public-listing flag |
| | `school_settings`, `school_branding` | 1:1 with school |
| | `school_memberships` | user ↔ school ↔ school role, status `active/invited/removed` |
| | `academic_years`, `academic_terms` | terms FK to year within the same school |
| | `school_departments`, `school_programmes`, `school_classes`, `school_subjects`, `school_houses` | configurable structure; classes carry `form_level` (1–3 by default, configurable) |
| Comms | `notifications` | per-user in-app notifications |

### Key functions

| Function | Purpose |
|---|---|
| `is_platform_user()`, `has_platform_permission(text)` | platform RBAC |
| `is_school_member(uuid)`, `has_school_permission(uuid,text)` | tenant RBAC (writes require school `active`) |
| `register_school(jsonb)` | creates pending school + settings + branding + registrant membership + audit + reviewer notifications |
| `review_school(uuid, text, text)` | approve/reject (`schools.verify`), creates Free subscription, notifies registrant |
| `set_school_status(uuid, text, text)` | suspend/reactivate (`schools.suspend`) |
| `add_school_member(uuid, text, text)` / `update_school_member(uuid, text, text)` | role assignment with escalation guards |
| `grant_platform_role(text, text)` / `revoke_platform_role(uuid)` | super-admin only |
| `platform_overview()` | aggregate counts only, no identifiable data |
| `public_school_directory(...)` / `public_plans()` | anon-safe public reads (only active + opted-in schools) |
| `log_audit(...)` | audited actions from the app |

## Phase 2 tables (implemented — `20261118000001_core_school_management.sql`)

| Table | Notes |
|---|---|
| `students` | per-school `student_number`; `user_id` links the student's own account (set only via `link_account`) |
| `guardians`, `student_guardians` | `can_view_records` controls a parent's portal access per child |
| `student_status_history` | written only by `change_student_status` / `promote_class` |
| `staff` | covers the brief's `staff`/`teachers` (`is_teaching`); `user_id` set only via `link_staff_account` |
| `teacher_assignments` | covers `teacher_subjects` + `teacher_classes`; one teacher per class×subject |
| `subject_registrations` | |
| `timetable_periods`, `timetable_slots` | unique constraints forbid class, teacher and room double-booking |
| `attendance` | one record per student per day; trigger checks the student is in the class |
| `grading_schemes`, `grading_bands` | school-defined; one default scheme |
| `assessments`, `assessment_scores` | trigger enforces max score and class membership |
| `result_publications` | gate for student/parent visibility of scores |
| `school_sequences` | per-school counters for `next_school_number()` |

Key helpers: `teaches(school, class, subject)`, `is_student_self()`, `is_guardian_of()`, `can_enter_scores()`, `assessment_published()`.
Account-link columns (`user_id`) are excluded from column grants, so they can only change through audited RPCs.

## Phase 3 tables (implemented — `20261119000001_learning_management.sql`)

| Table | Notes |
|---|---|
| `learning_materials` | notes / video / document / link per class × subject; `is_published` |
| `announcements` | school-wide (`class_id` null, with `audience`) or class/subject notices |
| `classroom_posts` | threaded discussion; hiding only via `moderate_post()` |
| `assignments`, `assignment_submissions` | submissions written only by `submit_assignment()` / `mark_submission()` |
| `library_resources` | `source` = school / open_licence / licensed_official (licence note required) |
| `questions` | type-checked answer keys; `source` labels AI-generated vs licensed past questions |
| `exams`, `exam_questions`, `exam_attempts`, `exam_answers` | attempts/answers written only by exam RPCs; papers lock once started |

Exam RPCs: `start_exam`, `exam_paper` (no answer keys), `save_exam_answer`, `submit_exam`, `finalise_expired_attempts`,
`mark_exam_answer`, `release_exam_results`, `exam_review`, `record_exam_in_results`. Also `classroom_names`,
`student_term_results`, `student_published_terms`.

## Phase 4 tables (implemented — `20261120000001_ai_intelligence.sql`)

| Table | Notes |
|---|---|
| `ai_settings` | per-school switches and student daily limit; `request_limit_override` only via `set_ai_limit()` |
| `ai_usage_logs` | written by the server (service role) only; feature, model, prompt version, tokens, estimated cost |
| `knowledge_documents`, `knowledge_chunks` | `school_id` null = platform-wide; `embedding vector(1536)` (HNSW), `tsv` for keyword search |
| `ai_tutor_conversations`, `ai_tutor_messages` | private to the student; messages server-written; flagged messages visible to `ai.safeguarding` |
| `ai_drafts` | teacher-assistant outputs, private to the author |
| `report_comments` | draft/approved; approval stamped by trigger; edits revert to draft |

RPCs: `ai_quota`, `set_ai_limit`, `platform_ai_usage`, `match_knowledge` (security invoker), `review_flagged_message`, `class_insights`.

## Phase 5 tables (implemented — `20261121000001_parents_operations.sql`)

| Table | Notes |
|---|---|
| `fee_items`, `student_invoices`, `invoice_lines`, `student_payments` | invoice totals recalculated by trigger; one active invoice per student per term; INV-/RCT- numbers per school |
| `payment_intents`, `school_payment_settings` | online payments; subaccount set by platform staff; completion by the server only (`complete_online_payment`) |
| `expenditure_records`, `school_budgets` | `finance.manage` |
| `dormitories`, `dorm_rooms`, `boarding_allocations` | trigger checks capacity, boarder residency and dorm gender |
| `library_books`, `library_loans` | trigger checks copies available |
| `inventory_items`, `inventory_transactions` | quantity changes only through the append-only ledger (`apply_stock_move`) |
| `school_assets`, `maintenance_requests` | any staff member can report a fault |
| `health_records`, `clinic_visits` | `health.manage` only; families see visits marked shared |
| `family_messages` | per child; staff who teach the class or hold `parents.message`, and the child's guardians; no edits/deletes |
| `notification_preferences`, `notification_outbox` | outbox is server-only |

RPCs: `generate_term_invoices`, `add_invoice_line`, `cancel_invoice`, `record_payment`, `reverse_payment`,
`create_payment_intent`, `complete_online_payment` (service role), `set_payment_settings` (platform),
`guardian_children`, `guardian_child_summary`.

## Phase 6 tables (implemented — `20261122000001_national_platform.sql`)

| Table | Notes |
|---|---|
| `sponsors` | platform finance staff only |
| `sponsorships` | one active per school; covers a % of one plan; school billing staff can read their own |
| `subscription_invoices` | `amount_due = list_amount − sponsor_amount`; one open invoice per school; written only by RPCs |
| `subscription_payment_intents` | Paystack references `AISHS-SUB-…`; completed by the server only |
| `support_tickets`, `support_messages` | requester, the school's administrators and support staff; internal notes visible to support staff only |

RPCs: `request_subscription`, `void_subscription_invoice`, `record_subscription_payment`, `assign_plan`, `set_sponsorship`,
`end_sponsorship`, `create_subscription_intent`, `complete_subscription_payment` (service role), `subscription_lifecycle`
(service role), `school_billing_summary`, `open_support_ticket`, `reply_support_ticket`, `update_support_ticket`,
`national_analytics`, `platform_revenue`. Trigger `students_plan_limit` enforces the active-student cap.

## Phase 7 (`20261123000001_production_hardening.sql`)

No new tables. Least-privilege grants, school_id locks, indexes for every foreign key, the `retention_days`
platform setting, `apply_retention()` (service role) and `my_data_export()`.

## Planned tables by phase

| Phase | Tables |
|---|---|
| 3 Learning (deferred) | `digital_courses`, `course_modules`, `lessons`, `learning_progress` (structured courses — later) |
| 4 AI (deferred) | `study_plans` (personalised revision plans) |
| 5 (deferred) | `school_events`, `school_clubs`, `school_sports`, `school_vehicles`, labs |
| 6 (deferred) | integrations / public API keys |

## Tenant extraction

To move one school to dedicated infrastructure: create the same schema on the target, then copy
`select * from <table> where school_id = $1` for every table having a `school_id` column (discoverable
via `information_schema.columns`), plus the referenced `profiles`. Because no tenant row references
another tenant, the copy is self-contained.
