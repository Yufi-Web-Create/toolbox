# AUTH-007 — Password recovery

## Objective
Implement the password recovery flow defined in docs/03_AUTH.md.

This is the final task in the initial authentication milestone.

This task does NOT implement tenant/workspace data, inbox/product features, database schema, RLS, OAuth, or external integrations.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required routes
Create:
- `/forgot-password`
- `/update-password`

Reuse:
- `/auth/callback`

## Required forgot-password behavior

The forgot-password flow must:
1. Render an email field.
2. Submit through a server-controlled action.
3. Call Supabase Auth `resetPasswordForEmail`.
4. Use an application-controlled redirect target that returns through `/auth/callback` and then to `/update-password`.
5. Show the same safe success message regardless of whether the email exists.
6. Never reveal account existence.

Suggested success message:
- "If an account exists for that email, we sent password reset instructions."

Do not expose raw provider errors.

## Callback integration

The existing `/auth/callback` must continue to handle code exchange safely.

Password recovery should use the existing safe local `next` behavior so the recovery link can continue to:
- `/update-password`

Do not weaken existing redirect validation.

## Required update-password behavior

The update-password flow must:
1. Require an authenticated recovery session produced by the callback flow.
2. Check authentication/recovery state server-side using the existing Supabase server client.
3. If no usable authenticated session/claims exist, redirect to `/forgot-password` or `/login` using an application-controlled path.
4. Render a new-password field.
5. Require at least 8 characters.
6. Submit through a server-controlled action.
7. Call Supabase Auth `updateUser({ password })`.
8. On success, redirect to `/login` with a controlled success indicator or show a safe success state that leads to `/login`.
9. Never display or log passwords, tokens, cookies, raw provider errors, or stack traces.

## Recovery-session safety

Do not manually parse or trust tokens from query parameters.

Do not implement custom reset tokens.

Use the existing Supabase session/cookie architecture.

## Error behavior

All provider failures must:
- use user-readable application-controlled messages
- not reveal raw provider details
- not reveal whether an account exists
- not expose tokens, cookies, passwords, codes, or secrets

## UX constraints

Keep UI minimal.
No design system/component library.

Allowed:
- email input
- new password input
- submit buttons
- safe status/error messages
- link back to login

Do not add unrelated product UI.

## Testing

Add focused automated tests for:
- malformed/missing email
- resetPasswordForEmail is called through mocked Supabase
- forgot-password response does not reveal account existence
- reset email redirect target uses /auth/callback and safe next=/update-password
- update-password rejects passwords shorter than 8 characters
- updateUser({ password }) is called on valid input
- missing recovery/auth state fails closed
- provider failures expose only safe application messages
- successful update results in controlled /login outcome

Tests must:
- mock Supabase
- not send real email
- not call live Supabase
- not require real credentials

## Environment

No new secrets.

Use existing public Supabase configuration only.

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
- create tenant/workspace/profile records
- add inbox/product UI
- add SNS/email/calendar integrations
- add OAuth providers
- modify Supabase project settings
- modify Vercel settings
- use service-role credentials
- add dependencies
- weaken /auth/callback redirect validation
- merge the PR

## Git workflow

- one task = one branch = one PR
- task-scoped branch, e.g. `codex/auth-007`
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the AUTH-007 Issue:
- `[CODEX:START]`
- `[CODEX:BLOCKED]` if needed
- `[CODEX:COMPLETE]`

## Completion criteria

PASS requires:
- `/forgot-password` exists
- reset email request is server-controlled
- `resetPasswordForEmail` is used
- account existence is not revealed
- recovery flow returns through existing callback and safely continues to `/update-password`
- `/update-password` exists
- recovery/auth state is checked server-side
- minimum 8-character password rule exists
- `updateUser({ password })` is used
- successful update has a controlled `/login` outcome
- no DB/RLS/tenant/product/integration behavior is added
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
