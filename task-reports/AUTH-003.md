# AUTH-003 Implementation Report

## Task
AUTH-003

## Summary
Added the Supabase verification callback Route Handler with safe code exchange, controlled failure handling, and local-only post-verification redirects.

## Branch
`codex/auth-003`

## Pull request
Draft PR targeting `main` (URL recorded in the Issue #13 completion report after creation).

## Changed files
- `src/app/auth/callback/route.ts`
- `src/app/auth/callback/route.test.ts`
- `task-reports/AUTH-003.md`

## Dependencies added
None.

## Route added
`/auth/callback`

## Code exchange behavior
- Reads the authorization `code` from the callback query string.
- Calls `supabase.auth.exchangeCodeForSession(code)` through the existing server Supabase client.
- Relies on the existing SSR client cookie adapter to write the exchanged session cookies.
- Does not manually construct or decode tokens.

## Redirect validation
- Reads the optional local redirect from the `next` query parameter.
- Requires the target to begin with `/`.
- Rejects protocol-relative, absolute external, and cross-origin targets.
- Resolves and returns only the local path, query string, and fragment.

## Success behavior
- Redirects to a validated local `next` path when supplied.
- Defaults to `/login`.

## Failure behavior
- Missing codes, provider/code-exchange errors, and unexpected failures redirect to `/login?error=verification_failed`.
- The error indicator is application-controlled and does not contain provider errors, codes, tokens, cookies, stack traces, or secrets.

## Database changes
None.

## Supabase project setting changes
None.

## Tests added
- Missing code redirects to the controlled failure state without creating a Supabase client.
- Successful code exchange defaults to `/login`.
- Provider failure does not expose raw details or the submitted code.
- Safe local redirect is accepted.
- Absolute external, protocol-relative, and backslash-based external redirect attempts are rejected.
- Supabase is mocked; no live service, real credentials, or email is used.

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
- Vitest: PASS (5 test files, 19 tests)
- Production build: PASS
- `/auth/callback` included as a dynamic route in the production build: PASS

## Deviations
None.

## Known issues
None.
