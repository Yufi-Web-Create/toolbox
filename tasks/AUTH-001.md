# AUTH-001 — Session refresh proxy

## Objective
Implement only the request-level Supabase session refresh foundation required by the approved authentication specification.

This task does NOT implement login, signup, logout, password reset, protected UI, tenant logic, or database changes.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required implementation

Create:
- `src/lib/supabase/proxy.ts` or an equivalent narrowly scoped request-session helper
- root `proxy.ts` required by Next.js 16

Behavior:
1. Create a Supabase server client for the incoming request.
2. Read and forward request cookies correctly.
3. Call `supabase.auth.getClaims()` to validate/refresh authentication state.
4. Write refreshed cookies to the response when Supabase updates them.
5. Return the response without implementing route redirects yet.

## Proxy matcher

Use a matcher that avoids static assets and other clearly unnecessary paths.
Do not invent product-specific protected-route rules in this task.

## Environment

Use the existing:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Do not add new environment-variable names.

No real credentials may be committed.

## Testing

Add focused unit tests for the request/session helper where practical.

Tests must:
- not call the live Supabase service
- not require real credentials
- verify cookie forwarding/update behavior or the relevant helper behavior through mocks

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
- add login/signup/logout pages
- add auth forms
- redirect unauthenticated users
- create protected routes
- create database tables or migrations
- change RLS
- modify Supabase project settings
- modify Vercel settings
- add service-role credentials
- add external OAuth providers
- change approved dependency versions unless strictly required by the existing packages and explicitly blocked otherwise
- merge the PR

## Git workflow

- task branch only
- Draft PR to main
- do not merge

## GitHub reporting

Required on the AUTH-001 Issue:
- [CODEX:START]
- [CODEX:BLOCKED] if needed
- [CODEX:COMPLETE]

## Completion criteria

PASS requires:
- Next.js 16 `proxy.ts` exists
- Supabase request session helper exists
- `getClaims()` is used for validation/refresh
- cookie propagation is handled
- no route protection/login UI is added
- no DB/RLS/provider setting changes
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
