# AUTH-003 — Verification callback

## Objective
Implement only the Supabase Auth callback route required to complete email verification and other PKCE code-exchange flows defined in docs/03_AUTH.md.

This task does NOT implement login UI, logout, protected /app routing, password recovery UI, tenant creation, database schema, or RLS.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required route
Create:
- /auth/callback

Use a Next.js Route Handler.

## Required behavior

The callback must:
1. Read the authorization code from the incoming request query string.
2. Exchange the code for a Supabase session using the existing server Supabase client.
3. Handle missing/invalid code safely.
4. Support an optional local redirect target after successful exchange.
5. Default successful verification to /login until later tasks add /app access.
6. Redirect failures to /login with a safe application-controlled error indicator or equivalent safe state.

## Redirect safety

Any optional redirect target must:
- be a local application path
- begin with /
- reject protocol-relative paths such as //
- reject absolute external URLs
- never allow arbitrary external redirection

Do not echo raw provider error messages into URLs.

## Session/cookie behavior

Use the existing SSR/server client foundation so that successful code exchange writes the session cookies correctly.

Do not manually construct or decode Supabase tokens.

## Error handling

Failures must:
- not expose raw provider errors
- not expose codes, tokens, cookies, stack traces, or secrets
- use a controlled application error state

## Testing

Add focused tests for:
- missing code
- successful code exchange
- provider/code-exchange failure
- safe local redirect accepted
- external/protocol-relative redirect rejected

Tests must:
- mock Supabase
- not call live Supabase
- not send email
- not require real credentials

## Environment

Use only existing environment variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

No new secrets.

## Required validation

Run:
- npm ci
- npm run lint
- npm run typecheck
- npm test
- npm run build

Existing GitHub Actions must pass.
Vercel Preview must build successfully.

## Forbidden

Do not:
- implement /login form
- implement logout
- implement protected /app shell
- implement forgot-password/update-password UI
- create database tables/migrations
- change RLS
- create tenant/workspace records
- add OAuth providers
- modify Supabase project settings
- modify Vercel settings
- use service-role credentials
- add dependencies unless explicitly blocked and approved
- merge the PR

## Git workflow
- one task = one branch = one PR
- task-scoped branch, e.g. codex/auth-003
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the AUTH-003 Issue:
- [CODEX:START]
- [CODEX:BLOCKED] if needed
- [CODEX:COMPLETE]

## Completion criteria

PASS requires:
- /auth/callback route exists
- code exchange is performed with Supabase
- session cookies are written via existing SSR client behavior
- safe local redirect validation exists
- default success redirect is /login
- safe failure redirect/state exists
- no login UI/logout/protected route/database/RLS behavior added
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
