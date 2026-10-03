# TENANT-003 — First organization onboarding UI

## Objective

Expose the first user-facing tenant onboarding flow for authenticated users who do not yet belong to any organization.

Use the already-approved TENANT-002 RPC through the existing server-side wrapper. This task adds no database objects and makes no provider/integration changes.

## User flow

For an authenticated user:

1. Visiting `/app` checks whether the user can read at least one organization through existing RLS.
2. If the user has no organization, redirect to `/app/onboarding`.
3. `/app/onboarding` shows a minimal form asking for an organization/workspace name.
4. Submitting the form calls the existing `createOrganizationWithOwner(name)` server wrapper.
5. On success, redirect to `/app`.
6. On failure, show a safe user-readable error and keep the form available.
7. If a user who already has at least one organization visits `/app/onboarding`, redirect them to `/app`.

Do not introduce organization switching or a selected/current organization concept in this task.

## Binding architecture

Follow:

- `docs/00_PRODUCT.md`
- `docs/01_ARCHITECTURE.md`
- `docs/02_DATABASE.md`
- `docs/03_AUTH.md`
- `docs/04_SECURITY.md`
- `docs/05_UI.md`
- `docs/09_DECISIONS.md`
- `docs/10_DO_NOT_DECIDE.md`
- `docs/07_COMMUNICATION.md`

## Authentication

Both `/app` and `/app/onboarding` remain protected routes.

Use the existing server-side auth architecture:

- existing Supabase server client
- `supabase.auth.getClaims()` as the trusted auth check
- unauthenticated users redirect to `/login?next=/app` or `/login?next=/app/onboarding` as appropriate
- do not use client-only protection
- do not use `getSession()` as the trusted authorization check

Do not duplicate proxy/session-refresh logic.

## Organization existence check

Use the existing RLS-protected `public.organizations` table.

The application only needs to determine whether at least one organization is visible to the authenticated user.

Requirements:

- server-side query
- minimal fields, preferably `id` only
- limit to one row
- no service role
- no RLS bypass
- do not infer or create a "current organization"
- provider/query failure must fail closed and show/redirect safely rather than pretending onboarding is complete

A small reusable server helper is allowed if needed.

## Onboarding form

Create:

- `/app/onboarding`

Minimal UI only:

- heading
- short instruction
- one text input for organization/workspace name
- submit button
- safe error message area

Do not choose a final product/service name. Generic wording such as "Organization", "Workspace", or "Set up your workspace" is acceptable.

### Form behavior

Use a Server Action or the narrowest existing Next.js pattern consistent with the repository.

Requirements:

- organization name is submitted server-side
- call the existing `createOrganizationWithOwner(name)` wrapper from TENANT-002
- do not duplicate the RPC logic
- do not expose raw Supabase/database errors
- on success redirect to `/app`
- empty/blank input may be rejected before RPC for user experience, but the database remains authoritative
- protect against accidental double-submit where reasonably possible with the existing form pattern; do not add dependencies

## /app behavior

Keep the current protected shell minimal.

Add only:

- organization existence check
- redirect to `/app/onboarding` when none exists

If at least one organization exists, render the existing application shell.

Do not add:

- tenant selector
- organization name display unless it falls out naturally from the existence query and requires no additional product decision
- dashboard metrics
- product navigation
- Inbox/Posts/Calendar/Templates/Settings UI

## Database

No migration.

Do not:

- create/alter tables
- create/alter policies
- create functions
- create indexes
- modify TENANT-002 RPC
- touch remote Supabase configuration

## Tests

Add focused automated tests for:

- authenticated user with zero visible organizations is redirected from `/app` to `/app/onboarding`
- authenticated user with at least one visible organization sees the existing `/app` shell
- organization lookup failure fails closed
- unauthenticated `/app/onboarding` redirects to login with a local next path
- authenticated user with existing organization visiting `/app/onboarding` is redirected to `/app`
- user with zero organizations sees the onboarding form
- blank form input shows a safe validation message and does not call the TENANT-002 wrapper
- successful organization creation redirects to `/app`
- failed organization creation shows the safe wrapper error and does not expose raw provider/database details

Tests must mock Supabase and the organization-creation wrapper. Do not use live credentials in unit tests.

## Live reviewer gate

After implementation review, the reviewer will verify on Preview with a fresh authenticated user:

1. no organization -> `/app` redirects to onboarding
2. create organization
3. user returns to `/app`
4. organization and owner membership exist in Supabase
5. revisiting onboarding redirects to `/app`

Codex must not create or delete live test users unless explicitly instructed.

## Out of scope

Do not:

- add organization switching
- add multiple-organization management
- add invitations/members
- add roles UI
- add profiles
- add customer/inbox/post/calendar/provider tables
- add provider integrations
- add navigation redesign
- add component/UI library
- add dependencies
- change auth email flows
- change Vercel/Supabase settings
- use service role

## Required validation

Run:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

GitHub Actions must pass.
Vercel Preview must be Ready.

## Git workflow

- one task = one branch = one PR
- suggested branch: `codex/tenant-003`
- Draft PR targeting `main`
- do not merge

## Reporting

Follow `docs/07_COMMUNICATION.md`.

Use:

- `[CODEX:START]`
- `[CODEX:PROGRESS]`
- `[CODEX:BLOCKED]`
- `[CODEX:COMPLETE]`

Final report:

`task-reports/TENANT-003.md`

## Completion gate

Implementation PASS requires:

- authenticated users with no organization are routed to onboarding
- organization creation uses TENANT-002 wrapper
- success returns user to `/app`
- existing organization prevents repeat onboarding
- RLS remains the tenant-data boundary
- no DB/provider/config changes
- no current-organization/switcher design is introduced
- tests and required checks pass
- Draft PR remains unmerged

Final approval additionally requires the reviewer Preview/live flow gate.
