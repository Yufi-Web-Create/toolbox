# AUTH-006 Implementation Report

## Task
AUTH-006

## Summary
Added the first protected application route at `/app` with a server-side Supabase claims check and fail-closed authentication behavior.

## Branch
`codex/auth-006`

## Pull request
[Draft PR #20](https://github.com/Yufi-Web-Create/toolbox/pull/20), targeting `main`.

## Changed files
- `src/app/app/page.tsx`
- `src/app/app/page.test.tsx`
- `task-reports/AUTH-006.md`

## Dependencies added
None.

## Route added
`/app`

## Protection behavior
- Implements `/app` as an async Server Component.
- Renders the minimal application shell only when authenticated claims exist.
- Does not rely on client-side state or UI hiding for protection.

## Auth check
- Creates the existing request-scoped SSR Supabase server client.
- Uses `supabase.auth.getClaims()` as the trusted authentication check.
- Does not call or trust `getSession()`.

## Redirect behavior
- Missing/null claims redirect to the fixed application-controlled `/login?next=/app` target.
- Provider errors and unexpected claims lookup failures fail closed to the same redirect.
- Raw provider errors and session details are not displayed, logged, or added to the redirect.

## Logout integration
No logout control is rendered in this intentionally minimal shell. The existing AUTH-005 logout action is unchanged, and no sign-out logic is duplicated.

## Caching behavior
- Exports `dynamic = "force-dynamic"` for the protected route.
- The page is request/session-dependent and does not use ISR or shared static caching.
- The production build reports `/app` as a dynamic server-rendered route.

## Database changes
None.

## Supabase project setting changes
None.

## Tests added
- Authenticated claims render the minimal protected shell.
- Null and missing claims redirect to `/login?next=/app`.
- Provider failure fails closed without exposing the provider error.
- Unexpected claims lookup failure also fails closed.
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
- Vitest: PASS (9 test files, 39 tests)
- Production build: PASS
- `/app` included as a dynamic server-rendered route: PASS

## Deviations
None.

## Known issues
None.
