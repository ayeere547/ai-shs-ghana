# API Reference

AI SHS Ghana has no public REST API for third parties yet. The app talks to the database through
Supabase (PostgREST + RPC functions) under the signed-in user's session, so Row Level Security decides
every read and write. This page lists the HTTP endpoints the app exposes and the main database functions.

## HTTP endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/health` | anyone (monitoring) | `{"status":"ok","database":"up","latency_ms":…}` → 200, or 503 when the database is unreachable / not configured. No secrets or versions. |
| `POST /api/webhooks/paystack` | Paystack | `x-paystack-signature` (HMAC-SHA512 of the raw body) required. `charge.success` references are re-verified with Paystack's API before anything is recorded. Fee references `AISHS-…`, subscription references `AISHS-SUB-…`. |
| `GET /api/cron/notifications` | scheduler | `Authorization: Bearer $CRON_SECRET`. Sends up to 50 queued emails/SMS. |
| `GET /api/cron/daily` | scheduler | Same auth. Subscription lifecycle and data retention; returns counts. Safe to re-run. |
| `GET /auth/callback` | Supabase Auth | Email confirmation / password-reset return; only same-site `next` paths are followed. |
| `POST /auth/signout` | signed-in user | Ends the session. |
| `GET /app/account/export` | signed-in user | JSON download of the caller's own data (Act 843 access request). Audited. |
| `GET /school/results/export` | results staff | CSV of a class's term results (formula-injection safe). |
| `GET /platform/analytics/export` | `analytics.national` | CSV of the aggregated regional table (small groups suppressed). Audited. |

Server actions (forms) are not a public API: they are POST endpoints bound to Next.js and re-check the
session and permission on every call.

## Database functions (RPC)

All are `SECURITY DEFINER` with a fixed `search_path`, check the caller's permission themselves and write
an audit entry for sensitive changes. Functions prefixed `_` are internal and cannot be called by users.

| Area | Functions |
|---|---|
| Platform & schools | `register_school`, `review_school`, `set_school_status`, `add_school_member`, `update_school_member`, `grant_platform_role`, `revoke_platform_role`, `platform_overview`, `public_school_directory` (anon), `public_school_profile` (anon), `public_platform_stats` (anon) |
| Students & staff | `next_school_number`, `change_student_status`, `promote_class`, `link_account`, `link_staff_account`, `unlink_account` |
| Academics | `replace_timetable`, `publish_results`, `student_term_results`, `student_published_terms`, `class_insights` |
| Learning | `submit_assignment`, `mark_submission`, `start_exam`, `exam_paper`, `save_exam_answer`, `submit_exam`, `mark_exam_answer`, `release_exam_results`, `exam_review`, `record_exam_in_results` |
| AI | `ai_quota`, `set_ai_limit`, `platform_ai_usage`, `match_knowledge`, `review_flagged_message` |
| Finance | `generate_term_invoices`, `add_invoice_line`, `cancel_invoice`, `record_payment`, `reverse_payment`, `create_payment_intent`, `set_payment_settings`, `complete_online_payment` (service role) |
| Parents | `guardian_children`, `guardian_child_summary` |
| Subscriptions | `request_subscription`, `void_subscription_invoice`, `record_subscription_payment`, `assign_plan`, `set_sponsorship`, `end_sponsorship`, `create_subscription_intent`, `school_billing_summary`, `platform_revenue`, `complete_subscription_payment` and `subscription_lifecycle` (service role) |
| Support | `open_support_ticket`, `reply_support_ticket`, `update_support_ticket` |
| Analytics | `national_analytics` (aggregate only) |
| Data protection | `my_data_export`, `apply_retention` (service role), `log_audit` |

## Future public API

A partner API (for example for ministries' approved data requests, or a school's own systems) should be
built as versioned route handlers with per-school API keys, scopes, rate limits and audit logging — not by
exposing the service-role key.
