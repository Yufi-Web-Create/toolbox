# AUTH-008 Implementation Report

## Task
AUTH-008

## Summary
Added a trusted server-side application origin for authentication emails and routed signup verification and password recovery through the existing safe callback.

## Branch
`codex/auth-008`

## Pull request
[Draft PR #26](https://github.com/Yufi-Web-Create/toolbox/pull/26), targeting `main`.

## Changed files
- `.env.example`
- `src/lib/app-url.ts`
- `src/lib/app-url.test.ts`
- `src/app/signup/actions.ts`
- `src/app/signup/actions.test.ts`
- `src/app/forgot-password/actions.ts`
- `src/app/forgot-password/actions.test.ts`
- `src/app/forgot-password/validation.ts` (removed)
- `task-reports/AUTH-008.md`

## APP_URL configuration
- Adds `APP_URL=http://localhost:3000` to `.env.example`.
- Keeps `APP_URL` server-side without a `NEXT_PUBLIC_` prefix.
- Accepts absolute HTTP or HTTPS origins, including localhost HTTP.
- Rejects missing or malformed values, paths, queries, fragments, credentials, and unsupported protocols.
- Returns a normalized origin without a trailing slash.

## Signup verification redirect
- `signUp` receives `options.emailRedirectTo` set to `<APP_URL>/auth/callback?next=/login`.
- Existing email/password validation and safe provider errors remain unchanged.
- Missing or invalid configuration fails closed before calling Supabase.

## Password recovery redirect
- `resetPasswordForEmail` receives `<APP_URL>/auth/callback?next=/update-password`.
- Request `Host` and `Origin` headers are no longer read or trusted.
- Provider and configuration failures preserve the same account-enumeration-resistant response.

## Callback changes
None. The existing local-only `next` validation and code exchange are unchanged.

## Security notes
- Auth email destinations derive only from validated server-side `APP_URL` configuration.
- Raw configuration and provider errors are not exposed or logged.
- No service-role credential, custom token, database change, or authorization change is introduced.

## Dependencies added
None.

## Database changes
None.

## Vercel/Supabase setting changes
None. The real deployment value remains reviewer-managed configuration.

## Tests
- Valid HTTPS and localhost HTTP origins.
- Missing, malformed, path, query, fragment, and unsupported-protocol APP_URL values.
- Exact signup verification redirect.
- Existing credential validation and safe signup provider failure.
- Safe signup failure for missing or invalid APP_URL.
- Exact password-recovery redirect without request-header authority.
- Non-enumerating provider and invalid-configuration outcomes.

## Validation commands
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Results
- `npm ci`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (13 test files, 71 tests)
- `npm run build`: PASS

## Deviations
None.

## Known issues
None.
