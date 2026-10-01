# AUTH-005 — Logout

## Objective
Implement only the server-controlled logout flow defined in docs/03_AUTH.md.

This task does NOT implement protected route enforcement, the /app shell, password recovery, tenant creation, database schema, or RLS.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required behavior

Implement a server-side logout action that:
1. Uses the existing SSR Supabase server client.
2. Calls `supabase.auth.signOut()`.
3. Relies on the existing cookie/session handling to clear the authenticated session.
4. Redirects to `/login` after successful logout.
5. Also redirects to `/login` after a provider/sign-out failure, using a safe application-controlled state if needed.

## Trigger/UI

Provide the smallest possible logout trigger that can be reused later.

Allowed:
- a minimal server-action form/button component
- a minimal action export without placing it in product UI yet

Do not create the /app shell in this task.

## Error behavior

Logout failures must:
- not expose raw provider errors
- not expose tokens, cookies, stack traces, or secrets
- not leave the user on a page that assumes authentication

After a logout attempt, the user should end at `/login`.

## Testing

Add focused tests for:
- signOut is called through the existing server client
- success redirects to /login
- provider/signOut failure still results in a safe /login outcome
- raw provider errors are not exposed

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
- create or protect /app
- add route-protection redirects
- implement password recovery
- create database tables/migrations
- change RLS
- create tenant/workspace records
- add OAuth providers
- modify Supabase project settings
- modify Vercel settings
- use service-role credentials
- add dependencies
- merge the PR

## Git workflow

- one task = one branch = one PR
- task-scoped branch, e.g. codex/auth-005
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the AUTH-005 Issue:
- [CODEX:START]
- [CODEX:BLOCKED] if needed
- [CODEX:COMPLETE]

## Completion criteria

PASS requires:
- server-side logout action exists
- Supabase Auth signOut is used
- session clearing relies on existing SSR cookie handling
- logout attempt ends at /login
- provider failure is handled safely
- no /app protection/database/RLS behavior added
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
