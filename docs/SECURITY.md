# Security and Data Protection

## Threat model — top risks and controls

| Risk | Control | Where |
|---|---|---|
| Cross-school data access (changing a URL/param) | RLS on every tenant table; `school_id` never trusted from the client; composite FKs; `school_id` immutable | migrations, `lib/school/context.ts` |
| Privilege escalation (user grants self a role) | No direct insert/update grants on `school_memberships`, `platform_users`, `schools.status`; RPCs check permission, forbid self-modification and platform-role grants from schools | `add_school_member`, `grant_platform_role` |
| Pending/suspended school continues operating | `has_school_permission` requires `schools.status = 'active'` | foundation migration |
| Suspended user keeps a valid JWT | every helper checks `profiles.status = 'active'` | foundation migration |
| Silent platform-admin changes | all state-changing RPCs write `audit_logs`; log is append-only | `log_audit` |
| Service-role key leakage | used only in `lib/supabase/admin.ts` (`server-only`), never `NEXT_PUBLIC_*` | |
| Account enumeration / brute force | generic errors, rate limits on login/register/reset, Supabase Auth limits | `(auth)/actions.ts` |
| Open redirect via `?next=` | `safeNextPath` | `lib/utils.ts` |
| CSRF | Server Actions (origin-checked by Next.js); sign-out is POST-only | |
| XSS | React escaping, no `dangerouslySetInnerHTML` except the static theme script; CSP-friendly headers | `next.config.ts` |
| SQL injection | parameterised Supabase queries; RPCs use typed parameters | |
| Logo upload abuse | storage bucket restricted to images ≤ 1 MB, path must start with a school the uploader manages | foundation migration |
| Exam answer leakage / cheating | `questions` readable only by the subject's teachers; papers served by `exam_paper()` without keys; attempts and answers writable only through RPCs that check ownership and the deadline | Phase 3 migration |
| Private classroom files | private bucket; reads require a visible row referencing the exact path; students upload only to their own submission folder | Phase 3 migration |
| Children's data exposure in analytics | national analytics are aggregate-only RPCs; no tenant row access for platform roles | `platform_overview()` |

## Ghana Data Protection Act, 2012 (Act 843)

Implemented in Phase 1: data minimisation (registration collects only what verification needs),
purpose notice + consent on account creation, access logging (audit log), role-based least privilege,
secure password reset. Scheduled: retention policies and data export/correction/deletion workflows
(Phase 7), guardian authorisation for student accounts (Phase 2/5), health data restricted to
`nurse` + explicit permission (done in Phase 5, with view logging). Formal legal review by a qualified Ghanaian data-protection
practitioner is required before processing real students' data; the platform should register with
the Data Protection Commission as a data controller/processor.

## AI safety (Phase 4)

* **Trust boundary:** tutor messages and AI usage are written only by the server with the service role,
  after authenticating the user and moderating input. Students can't forge replies, clear safety flags or
  manipulate the school's quota.
* **Child safety:** every tutor message passes local self-harm/abuse checks and provider moderation. A
  concern gets a fixed, caring reply (talk to a counsellor / trusted adult, 112 in an emergency), is flagged
  and alerts safeguarding staff, who see only flagged messages — never whole chats.
* **Privacy:** tutor images are sent to the model but not stored. Report comments and class insights are
  built from anonymised data (no names). No student data is used for model training by this platform;
  check your AI provider's data-use terms (API data is not used for training by default at OpenAI) and
  record the provider as a data processor.
* **Human review:** grades, report comments, generated questions and AI notes are drafts until a teacher
  approves or publishes them. Generated questions are labelled AI-generated, never official WAEC.
* **Honesty:** answers cite knowledge-base sources; uncited answers are labelled general explanations.
* **Cost control:** per-school monthly allowances (Free plan = none), per-student daily limits, usage logs.

## Parents, payments and health (Phase 5)

* **Guardians** see only children linked to them with `can_view_records`, and only published results.
* **Payments:** the browser never marks anything paid. Paystack webhooks are HMAC-SHA512 checked, then
  every reference is re-verified with Paystack's API; the amount and currency must match the intent and
  completion is idempotent. Only the server (service role) can complete an online payment. Manual
  payments and reversals are audited; reversals keep the original record.
* **Health data** is visible only to roles with `health.manage` (the nurse by default). Each view of a
  student's health record is written to the audit log. Families see only visits marked as shared.
* **Notifications:** email/SMS go through a server-only outbox; users choose channels; SMS text is
  short and avoids sensitive detail (it links back to the app).

## Operational

* Backups: Supabase daily backups + PITR on the paid tier; restore runbook in Phase 7.
* Keys: rotate `SUPABASE_SERVICE_ROLE_KEY` and provider keys on staff changes.
* Rate limiter is in-memory per instance — back it with Redis/Upstash before multi-instance scale.
