# Production Deployment

This is the checklist for going live. Local setup is in [INSTALLATION.md](INSTALLATION.md); day-to-day
operations (backups, incidents, key rotation) are in [RUNBOOK.md](RUNBOOK.md).

## 1. Accounts and plans

| Service | Why | Plan notes |
|---|---|---|
| Supabase | Database, auth, file storage | **Pro or higher**: daily backups, point-in-time recovery (add-on), no project pausing. Pick the region closest to Ghana that your plan offers. |
| Vercel | Hosting | **Pro** if you need email/SMS every 10 minutes — Hobby runs scheduled jobs at most once a day. |
| Paystack | Fees and subscription payments (GHS, Mobile Money, cards) | Business verification completed; live keys. |
| Resend | Email notifications | Verified sending domain (SPF/DKIM DNS records). |
| Arkesel or Hubtel | SMS | Registered sender ID (max 11 characters). |
| AI provider (OpenAI-compatible) | Tutor and teacher tools | Spending limit set on the provider account. |

## 2. Environment variables (Vercel → Settings → Environment Variables)

All variables are documented in `.env.example`. Production must have:

* `NEXT_PUBLIC_SITE_URL` — the real https domain (used in emails and payment return links).
* `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only — never prefix with `NEXT_PUBLIC_`).
* `CRON_SECRET` — a long random value (`openssl rand -hex 32`). Vercel sends it to scheduled jobs automatically.
* `PAYSTACK_SECRET_KEY` (`sk_live_…`), `RESEND_API_KEY`, `EMAIL_FROM`, `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`, AI variables, `NEXT_PUBLIC_SUPPORT_EMAIL`.

Use separate Supabase projects and Paystack **test** keys for preview/staging deployments.

## 3. Database

1. Apply migrations: `supabase db push`, or `DATABASE_URL=<session pooler URL> DATABASE_SSL_CA=<path to Supabase CA> npm run db:migrate`.
2. **Do not run `db:seed` in production** — it creates fictional sample schools.
3. In the Supabase dashboard → Advisors, confirm the security and performance advisors report no errors
   (the same properties are checked by `tests/security-audit.test.ts`).

## 4. Supabase Auth

* URL configuration: Site URL = production domain; redirect URL `<site>/auth/callback`.
* Email confirmation on; custom SMTP (your Resend domain) so mail isn't rate-limited.
* Password minimum 12 characters; enable leaked-password protection if your plan has it.
* Rate limits: keep Supabase defaults or stricter.

## 5. Payments (Paystack)

* Dashboard → Settings → API Keys & Webhooks: webhook URL `<site>/api/webhooks/paystack`.
* Each school receiving fees online needs a **subaccount** (Paystack → Subaccounts), entered by platform
  staff on the school's page. Subscription payments go to the main account.
* Make a small live test payment for a fee and a subscription before announcing.

## 6. Scheduled jobs

`vercel.json` defines:

| Path | Schedule | Does |
|---|---|---|
| `/api/cron/notifications` | every 10 min | sends queued email/SMS |
| `/api/cron/daily` | 05:00 UTC daily | subscription renewals, grace and past-due; data-retention rules |

On Vercel Hobby, change the notifications schedule to daily or call it from an external scheduler with
`Authorization: Bearer $CRON_SECRET`.

## 7. Monitoring

* Uptime monitor on `GET /api/health` (200 = healthy; 503 = database unreachable or not configured).
* Vercel → Logs for server errors (search `[cron/daily]`, `[notify]`).
* Supabase → Reports for database load; set a disk-usage alert.
* Review **Platform → Audit log** weekly and **Support** daily.

## 8. Go-live checklist

- [ ] `npm run typecheck && npm test && npm run build` pass on the release commit.
- [ ] `PW_CHANNEL=msedge npm run test:e2e` (or bundled Chromium) passes; run the signed-in journeys against staging with `E2E_*` test accounts.
- [ ] Migrations applied; no seed data in production.
- [ ] First super administrator granted (`npm run admin:grant -- email`); platform staff roles assigned with least privilege.
- [ ] Plan prices set under **Platform → Plans** (or left as "Contact us").
- [ ] Paystack webhook, Resend domain, SMS sender ID verified with a real message.
- [ ] Backups / point-in-time recovery enabled and one restore rehearsed ([RUNBOOK.md](RUNBOOK.md)).
- [ ] Privacy policy, terms and data-protection pages reviewed by a qualified Ghanaian lawyer.
- [ ] Registration with the Data Protection Commission completed (controller/processor) before real students' data is processed.
- [ ] Support email published (`NEXT_PUBLIC_SUPPORT_EMAIL`) and support staff trained ([ADMIN_GUIDE.md](ADMIN_GUIDE.md)).
