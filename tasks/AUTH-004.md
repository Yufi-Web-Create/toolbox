# AUTH-004 — Email/password login

## Objective
Implement only the email + password login flow defined in docs/03_AUTH.md.

This task does NOT implement logout, the protected application shell, route protection, password recovery, tenant creation, database schema, or RLS.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required route
Create:
- /login

## Required behavior

The login flow must:
1. Render an email field.
2. Render a password field.
3. Submit through a server-side action or equivalent server-controlled path.
4. Call Supabase Auth email/password login using `signInWithPassword`.
5. Use the existing SSR/server client foundation so the authenticated session is written to cookies.
6. Show safe user-readable errors.
7. On success, redirect to a validated local `next` path when supplied.
8. If no safe `next` path is supplied, redirect to `/` for this milestone.

This task must make `/login?next=/app` possible, but it must NOT create or protect `/app` yet.

## Validation

At minimum validate:
- email is present and structurally valid enough to reject obviously malformed input
- password is present

Do not add password complexity rules to login.

## Redirect safety

Any optional `next` target must:
- be a local application path
- begin with /
- reject protocol-relative paths such as //
- reject absolute external URLs
- reject cross-origin targets

Do not echo raw provider errors into redirect URLs.

## Error behavior

Authentication failures must:
- show a generic user-readable message
- not reveal whether the email exists
- not expose raw provider messages, stack traces, tokens, cookies, passwords, or secrets

Use one generic credential failure message for invalid credentials/provider auth failure.

## Existing callback error state

The login page must safely handle the application-controlled callback error:
- `error=verification_failed`

It may display a user-readable message such as:
- "We could not verify your account. Please try again."

Do not display arbitrary query-string error content.

## UX constraints

Keep UI intentionally minimal.
No design system/component library may be added.

The form should include:
- email label/input
- password label/input
- submit button
- accessible status/error text

A link to `/signup` is allowed.
Do not add product UI.

## Testing

Add focused automated tests for:
- invalid/missing email
- missing password
- successful login using mocks
- provider/invalid-credential failure uses a safe generic message
- safe local `next` accepted
- unsafe external/protocol-relative `next` rejected
- controlled `verification_failed` message behavior if implemented in a testable helper

Tests must:
- not call live Supabase
- not require real credentials

## Environment

Use only existing variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Do not add service-role keys or new secrets.

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
- implement logout
- create or protect /app
- add route-protection redirects in proxy.ts
- implement forgot-password/update-password
- create database tables/migrations
- change RLS
- create tenant/workspace records
- add OAuth providers
- modify Supabase project settings
- modify Vercel settings
- use service-role credentials
- add UI/state/form libraries
- merge the PR

## Git workflow

- one task = one branch = one PR
- task-scoped branch, e.g. codex/auth-004
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the AUTH-004 Issue:
- [CODEX:START]
- [CODEX:BLOCKED] if needed
- [CODEX:COMPLETE]

## Completion criteria

PASS requires:
- /login exists
- email/password form exists
- login occurs through a server-controlled path
- Supabase Auth signInWithPassword is used
- authenticated session uses existing SSR cookie handling
- safe local next redirect is supported
- default success redirect is /
- callback verification_failed state is user-readable and controlled
- provider/credential errors are generic and safe
- no logout/protected-route/database/RLS behavior added
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
