# AUTH-008 — Trusted auth email redirect origin

## Objective

Fix the verified integration gap where signup confirmation currently returns to the Supabase Site URL root with `?code=...` instead of the application's existing `/auth/callback` route.

Also remove request-header-derived absolute redirect origins from the password recovery email flow.

This task is limited to trusted auth-email redirect construction and its tests/configuration.

## Binding architecture

Follow:
- `docs/03_AUTH.md`
- `docs/04_SECURITY.md`
- `docs/08_TECH_STACK.md`
- `docs/09_DECISIONS.md`
- `docs/10_DO_NOT_DECIDE.md`

## Approved configuration

Add one server-side environment variable:

`APP_URL`

Rules:
- configuration only, not a secret
- absolute `http:` or `https:` URL
- origin only
- no path
- no query
- no fragment
- production value will be `https://toolbox-pink-nine.vercel.app` while `toolbox` remains an internal codename
- add a safe local example such as `http://localhost:3000` to `.env.example`
- do not expose `APP_URL` as `NEXT_PUBLIC_...`

Add the narrowest reusable server-side helper needed to:
- read `APP_URL`
- validate it
- return its normalized origin

Do not trust request `Host` or `Origin` headers as the authority for auth-email destinations.

## Signup change

Update the existing signup action only as needed so that:

`supabase.auth.signUp`

receives:

`options.emailRedirectTo = <APP_URL>/auth/callback?next=/login`

Requirements:
- keep current email/password validation
- keep current safe user-facing errors
- keep email verification required
- do not auto-login
- do not change callback code-exchange semantics
- do not expose provider errors

## Password recovery change

Update the existing forgot-password action so that its `resetPasswordForEmail` redirect URL is built from trusted `APP_URL`, not request headers.

Required destination:

`<APP_URL>/auth/callback?next=/update-password`

Keep:
- account-enumeration-resistant response
- existing callback
- recovery-session validation
- safe error behavior

Remove request-header origin dependency if it is no longer required.

## Callback

Do not weaken or redesign `/auth/callback`.

Existing rules remain:
- code exchange through Supabase
- local-only `next`
- controlled failure redirect
- no token/code logging

## Tests

At minimum add/update tests proving:

### APP_URL
- valid HTTPS origin accepted
- valid localhost HTTP origin accepted
- missing value rejected
- malformed URL rejected
- path rejected
- query rejected
- fragment rejected
- unsupported protocol rejected

### Signup
- valid signup calls `signUp` with `emailRedirectTo`
- destination is exactly `<APP_URL>/auth/callback?next=/login`
- invalid credentials still fail before Supabase call
- provider failure remains safe
- missing/invalid APP_URL fails closed with safe user-facing behavior

### Password recovery
- reset request uses exactly `<APP_URL>/auth/callback?next=/update-password`
- no request Host/Origin is used to choose destination
- provider failure remains non-enumerating
- missing/invalid APP_URL does not expose raw configuration/provider details

## Environment

Update `.env.example` only.

Do not change Vercel or Supabase settings from Codex.
Do not commit real values.

Reviewer will configure the real production `APP_URL` separately before live verification.

## Forbidden

Do not:
- change database schema/RLS
- add tenant/product UI
- change login/logout/session architecture
- add OAuth
- add dependencies
- use service-role
- change Supabase project settings
- change Vercel project settings
- add custom tokens
- log secrets/passwords/codes/cookies
- create a new callback route
- merge the PR
- start another task

## Validation

Run:
- npm ci
- npm run lint
- npm run typecheck
- npm test
- npm run build

GitHub Actions must pass.
Vercel Preview must be Ready.

## Git workflow

- one task = one branch = one PR
- suggested branch: `codex/auth-008`
- Draft PR targeting main
- do not merge

## GitHub reporting

Issue must receive:
- `[CODEX:START]`
- `[CODEX:BLOCKED]` if needed
- `[CODEX:COMPLETE]`

## Completion criteria

PASS requires:
- `APP_URL` validation helper implemented
- signup verification redirect points to existing callback
- forgot-password redirect uses the same trusted origin
- request headers are not the authority for auth email redirects
- safe errors preserved
- tests cover trusted-origin behavior
- no auth architecture weakening
- no database/product changes
- npm quality checks pass
- GitHub Actions passes
- Vercel Preview is Ready
- report exists
- Draft PR remains unmerged

Final reviewer live verification will confirm that a fresh signup confirmation email returns through `/auth/callback` rather than the site root.
