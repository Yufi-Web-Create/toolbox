# AUTH-006 — Protected application shell

## Objective
Implement only the first protected application route at `/app` using the approved Supabase Auth architecture.

This task does NOT implement tenant/workspace data, inbox features, provider integrations, password recovery, database schema, or RLS.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required route
Create:
- `/app`

## Required protection behavior

The protected application shell must:
1. Check authentication server-side using the existing Supabase server client.
2. Use `supabase.auth.getClaims()` as the trusted server-side auth-state check.
3. If authenticated claims are missing, redirect to `/login?next=/app`.
4. If authenticated claims exist, render the minimal application shell.
5. Not rely on client-side state for protection.
6. Not use `getSession()` as the trusted authorization check.

## Application shell

Keep the page intentionally minimal.

Allowed content:
- heading indicating the user is inside the application area
- minimal authenticated-user identifier if safely available from claims (for example email or subject)
- reusable logout form/button using AUTH-005 action

Do not add product navigation, inbox UI, settings UI, tenant selector, integrations, or dashboard metrics.

## Proxy behavior

AUTH-001 proxy/session refresh remains responsible for session refresh.

Do not duplicate the session-refresh implementation.

Do not add broad new proxy redirects unless required by the approved architecture and explicitly necessary for this task.

Route protection can be enforced directly by the server page/layout.

## Redirect safety

Unauthenticated redirect must be application-controlled:
- `/login?next=/app`

Do not derive this redirect from arbitrary user input.

## Caching

The protected route must not be statically cached or shared across users.

Use the request/session-dependent server behavior already provided by the Next.js/Supabase stack.

Do not add ISR.

## Logout integration

Use the existing AUTH-005 logout action.

Do not duplicate `signOut()` logic.

## Testing

Add focused automated tests for:
- authenticated claims render the protected shell
- missing/null claims redirect to `/login?next=/app`
- auth/provider failure fails closed to the login redirect
- existing logout action is wired into the shell if a logout control is rendered

Tests must:
- mock Supabase
- not call live Supabase
- not require real credentials

## Environment

No environment variable changes.

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
- create database tables/migrations
- change RLS
- create tenants/workspaces/profiles
- implement password recovery
- add inbox/product UI
- add SNS/email/calendar integrations
- add OAuth providers
- modify Supabase project settings
- modify Vercel settings
- use service-role credentials
- add dependencies
- merge the PR

## Git workflow

- one task = one branch = one PR
- task-scoped branch, e.g. `codex/auth-006`
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the AUTH-006 Issue:
- `[CODEX:START]`
- `[CODEX:BLOCKED]` if needed
- `[CODEX:COMPLETE]`

## Completion criteria

PASS requires:
- `/app` exists
- authentication is checked server-side
- `getClaims()` is used
- unauthenticated/missing claims redirect to `/login?next=/app`
- authenticated users see the minimal shell
- logout reuses AUTH-005 action if exposed
- no client-only protection is used
- no database/RLS/tenant/product behavior is added
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
