# SUPA-001 — Supabase client foundation

## Objective
Add the minimum Supabase client foundation to the Next.js application without implementing authentication, database schema, or product features.

This task exists to make the application structurally ready for later authentication work while keeping secrets and provider configuration controlled.

## Confirmed development project
- Supabase project name: toolbox-dev
- Region: ap-northeast-1
- Status at task creation: ACTIVE_HEALTHY

Do not hardcode project IDs, URLs, or keys into application source.

## Approved packages
Use only:
- @supabase/supabase-js
- @supabase/ssr

Do not add any other application dependency.

## Required implementation
Create the minimal Supabase client utilities needed for a Next.js App Router application:

- browser/client utility
- server utility compatible with Next.js cookies
- centralized environment-variable validation/helper

Use these environment variable names:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Do not use or request a service-role key.

## Environment handling
- Never commit real credentials
- Add/update .env.example with variable names only and non-secret placeholders
- Application code must fail clearly when required Supabase configuration is absent
- Do not expose any server-only secret because this task must not introduce one

## Testing
Add focused unit tests for the environment/configuration helper.

Tests must not call the live Supabase service.

## CI compatibility
The existing GitHub Actions quality gate must continue to pass without real Supabase credentials.

Therefore:
- tests must use controlled test values/mocks where needed
- production build in CI must not require a live Supabase connection
- no external network calls from tests

## Forbidden
Do not:
- create or alter database tables
- create migrations
- alter RLS
- implement sign-in/sign-up/logout
- create auth middleware
- create protected pages
- add user/profile tables
- modify Supabase project settings
- modify Vercel settings
- add environment values to GitHub
- add service-role credentials
- add any SNS/email/calendar/product integration
- merge the PR

## Validation
Run:
- npm ci
- npm run lint
- npm run typecheck
- npm test
- npm run build

## Git workflow
- One task = one branch = one PR
- Create a task-scoped branch such as codex/supa-001
- Create a Draft PR targeting main
- Do not merge

## GitHub reporting
Post to the SUPA-001 Issue:
- [CODEX:START]
- [CODEX:BLOCKED] if needed
- [CODEX:COMPLETE]

## Completion criteria
PASS requires:
- approved Supabase packages only
- browser and server client utilities exist
- configuration helper exists
- .env.example contains names/placeholders only
- no real credentials committed
- no DB/auth/product implementation
- focused tests added
- existing CI passes
- Vercel Preview builds successfully
- task report exists
- Draft PR exists and remains unmerged
