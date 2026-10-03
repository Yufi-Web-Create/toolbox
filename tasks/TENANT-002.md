# TENANT-002 — Atomic organization bootstrap RPC

## Objective

Add the narrow database/application foundation needed to create a user's first organization atomically.

TENANT-001 already provides the `organizations` and `organization_members` tables and RLS. This task adds one explicit PostgreSQL RPC that creates:

1. the organization row, and
2. the creator's owner membership row

inside one database transaction.

This task does NOT add onboarding UI yet.

## Why this task exists

The approved database design requires organization creation to produce both rows. Two separate Supabase client inserts are not atomic. Exposing onboarding before defining an atomic strategy could leave an organization without its required owner membership if the second insert failed.

The approved strategy for this task is one PostgreSQL function executed with the caller's privileges.

## Binding architecture

Follow:

- `docs/01_ARCHITECTURE.md`
- `docs/02_DATABASE.md`
- `docs/03_AUTH.md`
- `docs/04_SECURITY.md`
- `docs/09_DECISIONS.md`
- `docs/10_DO_NOT_DECIDE.md`

## Required database function

Create exactly one function:

`public.create_organization_with_owner(p_name text) returns uuid`

### Required behavior

When called by an authenticated user:

1. Obtain the authenticated user id from `auth.uid()`.
2. Reject the call when there is no authenticated user.
3. Insert one row into `public.organizations` with:
   - `name = trim(p_name)`
   - `created_by = auth.uid()`
4. Capture the new organization id.
5. Insert one row into `public.organization_members` with:
   - `organization_id = new organization id`
   - `organization_created_by = auth.uid()`
   - `user_id = auth.uid()`
   - `role = 'owner'`
6. Return the new organization id.

Both inserts must succeed or fail as one transaction.

Blank organization names must continue to be rejected by the existing table constraint. Do not duplicate business rules unnecessarily in application code.

## Security requirements

The function must:

- use the caller's privileges, not elevated privileges
- be explicitly `SECURITY INVOKER`
- preserve RLS enforcement
- not use service-role credentials
- not bypass policies
- not be `SECURITY DEFINER`
- use fully-qualified object names
- set a safe fixed `search_path` (prefer empty search_path)
- be executable by `authenticated`
- not be executable by `anon`
- not rely on user-editable metadata

Revoke default/public execute access as needed and grant only the approved role.

## Application wrapper

Add the narrowest server-side TypeScript wrapper needed for later onboarding code to call the RPC.

Requirements:

- server-side only
- uses the existing server Supabase client
- accepts an organization name
- calls `rpc("create_organization_with_owner", ...)`
- returns a typed success/failure result
- does not expose raw provider/database errors to the UI layer
- no route or visible UI yet

Do not introduce a new API route if a server module is sufficient.

## Migration

Add one normal Supabase migration containing only:

- function creation
- required revoke/grant statements

No table, column, constraint, policy, index, trigger, view, or extension changes are authorized.

### Important reviewer workflow for remote application

Do NOT apply the migration to Supabase yourself.

Open the Draft PR with the repository migration first.

The reviewer will:
1. review the PR,
2. apply the migration to the approved development Supabase project,
3. observe the remote migration version assigned by Supabase,
4. if that version differs from the repository filename, instruct you within the SAME task/PR to rename the migration file to the remote version,
5. require validation again before final approval.

Do not create a separate repair task for a timestamp mismatch.

## Tests

Add tests for the server wrapper and, where repository-supported, SQL/spec coverage for the RPC behavior.

At minimum prove or document the reviewer live gate for:

- authenticated User A can create Organization A and receives its UUID
- Organization A has exactly one owner membership for User A
- authenticated User B can independently create Organization B
- no cross-tenant membership is created
- unauthenticated/anon invocation is rejected
- blank name fails
- if membership insertion fails, the organization insert does not remain committed
- existing TENANT-001 RLS behavior remains intact

Do not use service-role access as the authorization being tested.

If atomic rollback cannot be safely tested in the repository environment, provide the narrow SQL/live test procedure and mark it as a reviewer gate.

## Out of scope

Do not:

- add onboarding UI
- change `/app` navigation
- add organization selection/switching
- add invitations or other members
- add role changes
- add update/delete policies
- change existing TENANT-001 RLS
- create triggers or views
- create additional helper functions
- add customer/inbox/post/calendar/provider tables
- add integrations
- add dependencies
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
- suggested branch: `codex/tenant-002`
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

`task-reports/TENANT-002.md`

## Completion gate

Implementation PASS requires:

- exactly one approved RPC
- SECURITY INVOKER
- RLS remains active
- authenticated-only execution permissions
- atomic two-row organization bootstrap
- server wrapper added without visible UI
- no unrelated schema/product changes
- tests and required checks pass
- Draft PR remains unmerged

Final approval additionally requires reviewer verification against `toolbox-dev`, including atomicity and tenant isolation.
