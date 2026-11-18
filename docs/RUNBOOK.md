# Operations Runbook

For on-call platform staff. Keep this next to the production credentials list (stored in a password
manager — never in this repository).

## Backups and recovery

**What is backed up**

* Supabase Pro takes daily database backups; the point-in-time recovery (PITR) add-on allows restoring to any
  second within the retention window. Enable PITR before onboarding real schools.
* Storage files (school logos, classroom files) are **not** in database backups. Copy the `classroom` and
  `school-logos` buckets nightly to separate storage (for example an S3-compatible bucket with versioning)
  using the Supabase storage API or `rclone`.
* Code and migrations live in git; `.env` values live in the password manager and Vercel.

**Targets** (adjust to your contract with schools): recovery point ≤ 24 h (≤ minutes with PITR), recovery time ≤ 4 h.

**Restore drill — every quarter**

1. Create a new Supabase project (or a branch) and restore the latest backup / a PITR timestamp into it.
2. Point a **staging** deployment at it and sign in as a test account.
3. Check row counts of `schools`, `students`, `student_payments` against production.
4. Record the date, duration and any problems in the audit log (Platform → Audit log is read-only, so keep the record in your ops notes).

**Real restore**

1. Announce maintenance on the status channel; stop scheduled jobs (remove `CRON_SECRET` in Vercel temporarily).
2. Restore via Supabase (PITR to just before the incident).
3. Re-run `npm run db:migrate` if the backup predates the latest migration.
4. Re-enable `CRON_SECRET`; payments made during the gap are re-confirmed from Paystack: for each Paystack
   transaction in the window, open the school's page and compare; the webhook can be replayed from the Paystack dashboard (completion is idempotent).

## Incidents

1. **Triage** — `GET /api/health`, Vercel logs, Supabase status page.
2. **Contain** — suspend a compromised school (Platform → Schools → Suspend), revoke a platform role (Platform staff), or rotate keys (below).
3. **Communicate** — tell affected schools through Support and email.
4. **Review** — write up cause, impact and fixes within 5 working days.

### Personal data breach

Ghana's Data Protection Act, 2012 (Act 843) requires a data controller to notify the **Data Protection
Commission** and the affected people of a security compromise as soon as reasonably practicable. Schools are
controllers of their students' records; the platform team must tell affected schools immediately so they can
meet their duties, and notify the Commission for platform-held data. Record what data, how many people, when it
was discovered and what was done. Get legal advice early.

## Key rotation

| Secret | When | How |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | staff leave, suspected leak, yearly | Supabase → Settings → API → roll JWT secret (this also rotates the anon key — update both in Vercel, redeploy) |
| `PAYSTACK_SECRET_KEY` | suspected leak, yearly | Paystack → API keys → generate new; update Vercel; webhooks are signed with the new key |
| `CRON_SECRET` | staff leave | new random value in Vercel; redeploy |
| Resend / SMS / AI keys | suspected leak, yearly | regenerate in the provider; update Vercel |

After any rotation, check `/platform/settings` → Integrations shows every service as configured.

## Common tasks

| Situation | What to do |
|---|---|
| Parent says they paid but the invoice isn't updated | Ask for the Paystack reference. If the webhook was missed, replay it from the Paystack dashboard. The parent can also reopen the payment return link. |
| "Payment received but not applied" in a school's audit log | The amount differed or the invoice was cancelled. Refund in Paystack or record the payment manually after checking. |
| Subscription invoice paid by bank transfer | Platform → school page → Subscription → record payment with the bank reference. |
| Emails/SMS not arriving | Platform → Settings → Integrations; then check `notification_outbox` rows with status `failed` and the provider dashboard. |
| School asks to leave | Export what they need, then follow the deletion request process below. |
| Account deletion request (Support → Data protection) | Verify identity (reply from the account's email, or the school confirms). Delete the auth user in Supabase → Authentication (profile and memberships cascade). Records the school must keep (results, receipts) stay with the school; tell the requester what remains and why. Close the ticket with what was done. |
| Daily job failed | Vercel logs `[cron/daily]`. It is safe to re-run: `curl -H "Authorization: Bearer $CRON_SECRET" <site>/api/cron/daily`. |

## Retention

Defaults live in `platform_settings.retention_days` and run daily: read notifications 180 days, sent/failed
outbox 30 days, abandoned payment attempts 90 days, AI usage logs 730 days, unflagged AI tutor chats 365 days
after the last message. Audit logs, invoices, payments and results are kept. To change a value, update the JSON
in Supabase SQL (`update platform_settings set value = '…' where key = 'retention_days'`) and note why.
