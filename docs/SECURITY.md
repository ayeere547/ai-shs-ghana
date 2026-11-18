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
| Children's data exposure in analytics | national analytics are aggregate-only RPCs; no tenant row access for platform roles | `platform_overview()` |

## Ghana Data Protection Act, 2012 (Act 843)

Implemented in Phase 1: data minimisation (registration collects only what verification needs),
purpose notice + consent on account creation, access logging (audit log), role-based least privilege,
secure password reset. Scheduled: retention policies and data export/correction/deletion workflows
(Phase 7), guardian authorisation for student accounts (Phase 2/5), health data restricted to
`nurse` + explicit permission (Phase 5). Formal legal review by a qualified Ghanaian data-protection
practitioner is required before processing real students' data; the platform should register with
the Data Protection Commission as a data controller/processor.

## AI safety (Phase 4)

Student conversations are not used for model training; AI output that affects grades or reports is
always a draft requiring teacher approval; generated questions are never labelled as official WAEC
questions.

## Operational

* Backups: Supabase daily backups + PITR on the paid tier; restore runbook in Phase 7.
* Keys: rotate `SUPABASE_SERVICE_ROLE_KEY` and provider keys on staff changes.
* Rate limiter is in-memory per instance — back it with Redis/Upstash before multi-instance scale.
