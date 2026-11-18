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

## Planned tables by phase

| Phase | Tables |
|---|---|
| 2 Core school management | `students`, `staff`, `teachers`, `guardians`, `parents`, `student_guardians`, `student_enrolments`, `subject_registrations`, `teacher_subjects`, `teacher_classes`, `timetables`, `timetable_periods`, `attendance`, `grading_schemes`, `student_results`, `report_cards`, import batches |
| 3 Learning | `learning_materials`, `digital_courses`, `course_modules`, `lessons`, `learning_progress`, `assignments`, `assignment_submissions`, `assessments`, `examinations`, `examination_questions`, `examination_attempts`, `examination_answers`, `question_banks` |
| 4 AI | `knowledge_documents`, `knowledge_chunks` (+`embedding vector`), `ai_tutor_conversations`, `ai_tutor_messages`, `ai_usage_logs`, `ai_prompt_versions`, `study_plans` |
| 5 Parents & operations | `fee_structures`, `student_invoices`, `student_payments`, `payment_records`, `expenditure_records`, `school_budgets`, `dormitories`, `rooms`, `boarding_allocations`, `library_books`, `library_transactions`, `inventory_items`, `inventory_transactions`, `school_assets`, `maintenance_requests`, `school_events`, `school_clubs`, `school_sports`, `school_vehicles`, `health_records`, `clinic_visits`, `emergency_contacts`, `announcements`, `messages`, `notification_preferences` |
| 6 National | `payments` (subscription), `support_tickets`, `support_requests`, invoices, integrations |

## Tenant extraction

To move one school to dedicated infrastructure: create the same schema on the target, then copy
`select * from <table> where school_id = $1` for every table having a `school_id` column (discoverable
via `information_schema.columns`), plus the referenced `profiles`. Because no tenant row references
another tenant, the copy is self-contained.
