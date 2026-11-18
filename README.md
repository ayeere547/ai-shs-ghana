# AI SHS Ghana

National multi-school, AI-powered management and learning platform for Ghanaian Senior High Schools.
Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + RLS, Auth, Storage).

**Status:** Phases 1–4 (foundation, school management, learning management, AI) built and tested — see [docs/PROGRESS.md](docs/PROGRESS.md).

| Doc | |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | system design, multi-tenancy, RBAC |
| [DATABASE](docs/DATABASE.md) | schema, functions, planned tables |
| [SECURITY](docs/SECURITY.md) | threat model, Act 843 |
| [INSTALLATION](docs/INSTALLATION.md) | setup, first super admin, deployment |
| [TESTING](docs/TESTING.md) | RLS + unit tests |

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev                  # http://localhost:3400
npm test
```

## Layout
```
src/app/(marketing)   public website + school directory
src/app/(auth)        sign in, register, password reset
src/app/app           account hub, notifications
src/app/register-school
src/app/platform      national console (verification, staff, audit)
src/app/school        staff workspace (management, classroom, assignments, exams, library, results)
src/app/student       student portal
src/lib               auth/session, validation, school resource engine, site content
supabase/migrations   schema + RLS + RPCs
tests                 PGlite RLS tests, unit tests
```

Sample seed data is fictional and labelled “Sample data”. AI SHS Ghana is independent and not
affiliated with GES, NaCCA, WAEC or the Ministry of Education.
