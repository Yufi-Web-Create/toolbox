# AUTH-007 Implementation Report

## Task
AUTH-007

## Summary
Added the minimal password recovery flow with server-controlled reset requests, the existing safe callback exchange, and a server-checked password update page.

## Branch
`codex/auth-007`

## Pull request
[Draft PR #22](https://github.com/Yufi-Web-Create/toolbox/pull/22), targeting `main`.

## Changed files
- `src/app/forgot-password/page.tsx`
- `src/app/forgot-password/forgot-password-form.tsx`
- `src/app/forgot-password/actions.ts`
- `src/app/forgot-password/actions.test.ts`
- `src/app/forgot-password/validation.ts`
- `src/app/update-password/page.tsx`
- `src/app/update-password/page.test.tsx`
- `src/app/update-password/update-password-form.tsx`
- `src/app/update-password/actions.ts`
- `src/app/update-password/actions.test.ts`
- `task-reports/AUTH-007.md`

## Dependencies added
None.

## Routes added
- `/forgot-password`
- `/update-password`

## Forgot-password behavior
- Renders a minimal labeled email form and submits through a Server Action.
- Validates missing and obviously malformed email input.
- Calls `supabase.auth.resetPasswordForEmail` through the existing SSR server client.
- Returns the same safe success message for provider success, unknown accounts, provider errors, and unexpected failures.

## Callback integration
- Builds an application-controlled recovery destination at `/auth/callback?next=/update-password` on the current same-origin application URL.
- Reuses the existing `/auth/callback` authorization-code exchange and its local-only `next` validation.
- Does not change or weaken the callback implementation.
- Does not create, parse, or trust custom reset tokens.

## Update-password behavior
- Renders a minimal new-password form only after a server-side auth check.
- Requires at least eight characters in the form and Server Action.
- Calls `supabase.auth.updateUser({ password })` through the existing SSR server client.
- Redirects successful updates to the controlled `/login` path.

## Recovery/session checks
- Uses `supabase.auth.getClaims()` on the server page before rendering the update form.
- Rechecks claims inside the update Server Action before changing the password.
- Missing claims and claims lookup failures fail closed to `/forgot-password` at page access or a safe session-expired action message.
- The route is force-dynamic and does not use ISR or shared static caching.

## Error handling
- Passwords, tokens, cookies, authorization codes, stack traces, and raw provider errors are not displayed or logged.
- Password reset responses do not reveal whether an account exists.
- Password update provider failures use a fixed application-controlled message.

## Database changes
None.

## Supabase project setting changes
None.

## Tests added
- Missing and malformed recovery email validation.
- Mocked `resetPasswordForEmail` call with safe callback/update destination.
- Identical non-enumerating response for reset provider failure.
- Passwords shorter than eight characters are rejected.
- Mocked `updateUser({ password })` call and controlled `/login` success outcome.
- Missing update claims fail closed.
- Update provider failures expose only a fixed safe message.
- Update page renders only with claims and fails closed on missing/error states.
- Supabase is mocked; no live service, real credentials, or email sending is used.

## Validation commands
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Results
- Clean dependency installation: PASS
- ESLint: PASS
- TypeScript validation: PASS
- Vitest: PASS (12 test files, 53 tests)
- Production build: PASS
- `/forgot-password` and dynamic `/update-password` included in the production build: PASS

## Deviations
None.

## Known issues
None.
