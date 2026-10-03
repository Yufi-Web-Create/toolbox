# TENANT-003 Implementation Report

## Task

TENANT-003 — First organization onboarding UI

## Summary

Added the first authenticated organization onboarding flow. `/app` now checks
for at least one organization visible through existing RLS and redirects users
with none to `/app/onboarding`. The onboarding page uses the existing TENANT-002
server wrapper to create the organization and owner membership, then returns the
user to `/app`.

## Changed files

- `src/app/app/page.tsx`
- `src/app/app/page.test.tsx`
- `src/app/app/onboarding/page.tsx`
- `src/app/app/onboarding/page.test.tsx`
- `src/app/app/onboarding/actions.ts`
- `src/app/app/onboarding/actions.test.ts`
- `src/app/app/onboarding/onboarding-form.tsx`
- `src/lib/organizations/server.ts`
- `src/lib/organizations/server.test.ts`
- `task-reports/TENANT-003.md`

## Added dependencies

None.

## Database changes

None. No migration, schema, RLS, remote Supabase configuration, or migration
history change was made.

## Implementation details

- Both `/app` and `/app/onboarding` validate authentication on the server with
  `supabase.auth.getClaims()` and never use `getSession()` as a trusted check.
- Organization existence is queried server-side through the existing
  request-scoped Supabase client using `organizations.select("id").limit(1)`.
  Existing RLS remains the authorization boundary.
- `/app` redirects users with zero visible organizations to `/app/onboarding`.
  A successful lookup with at least one organization preserves the existing
  minimal application shell.
- Lookup errors fail closed with a generic message and do not treat onboarding
  as complete or expose raw provider/database details.
- `/app/onboarding` redirects unauthenticated users to
  `/login?next=/app/onboarding` and users with an existing organization to
  `/app`.
- The onboarding form contains only one organization-name input and one submit
  button. Pending submission disables the button to reduce accidental duplicate
  submission.
- The server action rejects blank input before any RPC call, rechecks trusted
  claims, and then rechecks organization visibility. Lookup failure returns a
  safe error, an existing organization redirects to `/app`, and only a confirmed
  zero-organization result can call `createOrganizationWithOwner(name)`.
- Successful organization creation redirects to `/app`.
- No current-organization concept, switcher, membership management, navigation
  redesign, or product module was introduced.

## Tests executed

- `/app` redirects a zero-organization user to onboarding.
- `/app` renders for a user with an RLS-visible organization.
- Organization lookup errors fail closed with a safe message.
- Unauthenticated onboarding access redirects to login with a local next path.
- Users with an organization are redirected away from onboarding.
- Users without an organization see the minimal onboarding form.
- Blank names do not call the TENANT-002 wrapper.
- Successful creation calls the wrapper and redirects to `/app`.
- Failed creation returns a safe error without raw Supabase/database details.
- The action redirects an existing-organization user to `/app` without calling
  the creation wrapper.
- An action-time organization lookup failure returns a safe error without
  calling the creation wrapper.
- The reusable lookup selects only `id`, limits results to one, reports
  zero/one correctly, and fails safely on errors or exceptions.

## Validation commands

- `npm ci`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (16 files, 94 tests)
- `npm run build`: PASS
- `git diff --check`: PASS

## Results

All required local validation passed. The preview/live onboarding flow remains
the reviewer gate; Codex did not create or delete any live test user.

## Deviations from specification

None.

## Known issues

- Preview verification with a fresh authenticated user remains reviewer-managed.

## Security notes

- Authentication and organization checks execute only on the server.
- Existing user-session cookies and RLS-protected queries are used; no service
  role or authorization bypass is present.
- Raw authentication, Supabase, and database errors are neither displayed nor
  logged.
- No Supabase or Vercel setting was changed.
