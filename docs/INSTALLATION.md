# Installation & Deployment

## Prerequisites
Node.js 20–24, a Supabase project, and (for production) a Vercel account.

## 1. Configure
```bash
cp .env.example .env.local
```
Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SITE_URL`. Every variable is documented in `.env.example`.

## 2. Database
Apply the migrations in `supabase/migrations` in order — either:
* `supabase db push` (Supabase CLI), or
* `DATABASE_URL=<session-mode connection string> npm run db:migrate`, or
* paste each file into the Supabase SQL editor.

Optional development sample data (fictional schools, clearly labelled — never in production):
`npm run db:seed`.

## 3. Supabase Auth settings
* Authentication → URL configuration: Site URL = `NEXT_PUBLIC_SITE_URL`; add `<site>/auth/callback` to redirect URLs.
* Password policy: minimum 12 characters (matches the app's validation).
* Enable email confirmation. Configure a custom SMTP sender for production.

## 4. First Super Administrator
1. Sign up at `/register` and confirm your email.
2. `DATABASE_URL=... npm run admin:grant -- you@example.com`
3. Sign in — you land in the national platform console. Grant other platform roles from **Platform staff**.

## 5. Run
```bash
npm install
npm run dev      # http://localhost:3400
```

## 6. Deploy (Vercel)
Import the repository, set the same environment variables, deploy. Update the Supabase Site URL and
redirect URLs to the production domain. Put Cloudflare in front for DNS/WAF if desired.

## Checks before going live
`npm run typecheck && npm test && npm run build` must all pass.
