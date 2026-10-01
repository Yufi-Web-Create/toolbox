# AUTH-004 Implementation Report

## Task
AUTH-004

## Summary
Added the minimal email/password login flow at `/login` using a server-controlled Supabase Auth action, safe redirect validation, and controlled error messaging.

## Branch
`codex/auth-004`

## Pull request
Draft PR targeting `main` (URL recorded in the Issue #15 completion report after creation).

## Changed files
- `src/app/login/page.tsx`
- `src/app/login/login-form.tsx`
- `src/app/login/actions.ts`
- `src/app/login/actions.test.ts`
- `src/app/login/validation.ts`
- `src/app/login/validation.test.ts`
- `task-reports/AUTH-004.md`

## Dependencies added
None.

## Route added
`/login`

## Login behavior
- Renders labeled email and password fields, a submit button, accessible error text, and an allowed `/signup` link.
- Submits credentials through a Server Action.
- Calls `supabase.auth.signInWithPassword` through the existing server Supabase client.
- Relies on the existing SSR client cookie adapter to persist the authenticated session.

## Validation rules
- Requires a structurally valid email address.
- Requires a non-empty password without adding login password-complexity rules.

## Redirect behavior
- Accepts an optional `next` application path.
- Requires the target to begin with `/` and rejects protocol-relative, absolute external, cross-origin, and backslash-based external targets.
- Redirects successful login to a validated `next` path, including `/app` without creating or protecting that route.
- Defaults successful login to `/`.

## Callback error handling
- Maps only the application-controlled `error=verification_failed` value to a fixed user-readable message.
- Ignores arbitrary query-string error content.

## Error handling
- Uses the same generic message for provider and invalid-credential failures.
- Does not reveal whether the email exists or expose raw provider errors, passwords, tokens, cookies, stack traces, or secrets.

## Database changes
None.

## Supabase project setting changes
None.

## Tests added
- Missing and malformed email validation.
- Missing password validation.
- Successful mocked `signInWithPassword` and default redirect.
- Generic provider/credential failure behavior.
- Safe local `next` acceptance.
- Absolute external, protocol-relative, and backslash-based external `next` rejection.
- Controlled `verification_failed` message and arbitrary error rejection.
- Supabase is mocked; no live service or real credentials are used.

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
- Vitest: PASS (7 test files, 31 tests)
- Production build: PASS
- `/login` included as a dynamic route in the production build: PASS

## Deviations
None.

## Known issues
None.
