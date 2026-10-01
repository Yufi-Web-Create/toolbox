# AUTH-002 — Email/password signup

## Objective
Implement only the initial email + password signup flow defined in docs/03_AUTH.md.

This task does NOT implement login, logout, protected application pages, tenant creation, password recovery, OAuth, or database schema changes.

## Binding architecture
Follow:
- docs/03_AUTH.md
- docs/08_TECH_STACK.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## Required route
Create:
- /signup

## Required behavior

The signup flow must:
1. Render an email field.
2. Render a password field.
3. Submit through a server-side action or equivalent server-controlled path.
4. Call Supabase Auth email/password signup.
5. Use only the existing publishable-key client/session foundation.
6. Show a user-readable success state that tells the user to check their email for verification.
7. Show a user-readable error state for provider/validation failures.
8. Avoid exposing raw provider responses, stack traces, tokens, cookies, or secrets.

## Email verification

Email verification remains required.

Do not:
- auto-login the user as a substitute for verification
- bypass verification in application code
- build callback handling in this task

AUTH-003 will implement the verification callback.

## Validation

At minimum validate:
- email is present and structurally valid enough to avoid obviously malformed input
- password is present
- password meets the minimum requirement used by the application

Application password rule for this milestone:
- minimum 8 characters

Do not add extra password-complexity rules unless separately approved.

## Redirect behavior

After a successful signup request:
- stay on /signup
- show a confirmation message instructing the user to check their email

Do not redirect into /app because verification handling is not implemented yet.

## UX constraints

Keep UI intentionally minimal.
No design system/component library may be added.

The form should include:
- email label/input
- password label/input
- submit button
- accessible status/error text

Do not implement unrelated marketing or product UI.

## Testing

Add focused automated tests for:
- invalid/missing input
- successful signup request using mocks
- provider error handling

Tests must:
- not call live Supabase
- not send real email
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
- implement login
- implement logout
- implement /auth/callback behavior
- implement protected route redirects
- create /app product shell
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
- task-scoped branch, e.g. codex/auth-002
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the AUTH-002 Issue:
- [CODEX:START]
- [CODEX:BLOCKED] if needed
- [CODEX:COMPLETE]

## Completion criteria

PASS requires:
- /signup exists
- email/password form exists
- signup occurs through a server-controlled path
- Supabase Auth signUp is used
- minimum 8-character password rule exists
- successful request shows email-verification instruction
- provider/validation errors are user-readable and safe
- no callback/login/protected route/database/RLS behavior added
- automated tests pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged
