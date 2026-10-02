# TENANT-001 — Organization and membership RLS foundation

## Objective

Implement only the first multi-tenant database foundation defined in `docs/02_DATABASE.md`.

Create:
- `organizations`
- `organization_members`
- their constraints, indexes where required, and RLS policies

This task does NOT add tenant UI, onboarding UI, profiles, customers, conversations, messages, provider integrations, or product features.

## Binding architecture

Follow:
- `docs/01_ARCHITECTURE.md`
- `docs/02_DATABASE.md`
- `docs/04_SECURITY.md`
- `docs/09_DECISIONS.md`
- `docs/10_DO_NOT_DECIDE.md`

## Required schema

### organizations

Required columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`

Required constraints:

- organization name must not be blank after trimming
- `unique (id, created_by)`

### organization_members

Required columns:

- `organization_id uuid not null`
- `organization_created_by uuid not null`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role text not null`
- `created_at timestamptz not null default now()`

Required constraints:

- primary key `(organization_id, user_id)`
- role limited to:
  - `owner`
  - `member`
- composite foreign key:
  - `(organization_id, organization_created_by)`
  - references `organizations(id, created_by)`
  - `on delete cascade`

The `organization_created_by` column is intentionally denormalized.
Its purpose is to let owner-membership RLS validate creator ownership without querying `organizations`, thereby avoiding a circular RLS dependency.
The composite foreign key must guarantee that the duplicated creator id matches the target organization.

## Required RLS

Enable RLS on both tables.

### organizations policies

Authenticated INSERT:
- allowed only when `created_by = auth.uid()`

SELECT:
- allowed when the row was created by the current user, OR
- the current user has their own membership row for that organization

Do not add UPDATE or DELETE policies in this task.

### organization_members policies

SELECT:
- current user may read only rows where `user_id = auth.uid()`

INSERT:
- current user may insert only their own row
- role must be `owner`
- `organization_created_by = auth.uid()`

Do NOT query `organizations` from the membership INSERT policy.
The composite foreign key is the database-level guarantee that `organization_created_by` matches the actual organization creator.

Do not add UPDATE or DELETE policies in this task.

## Security constraints

Do not:
- use service-role credentials to bypass RLS
- create SECURITY DEFINER functions
- create triggers
- create views
- add helper database functions
- disable RLS
- create permissive catch-all policies
- allow arbitrary self-joining to another organization

If the specified design still cannot be implemented safely without one of the forbidden mechanisms, stop and report `[CODEX:BLOCKED]`.

## Migration

Add the schema as a normal Supabase migration in the repository's migration structure.

If a Supabase migration directory does not yet exist, create the minimal standard directory required for migrations only.

Do not modify the remote Supabase project directly unless the task environment explicitly provides the approved project connection and the action is part of the assigned task.

Do not apply destructive SQL.

## Tests

Add SQL/RLS tests or the narrowest repository-supported equivalent that proves the policy intent.

At minimum cover two distinct users and two organizations:

- User A can access Organization A.
- User B can access Organization B.
- User A cannot access Organization B.
- User B cannot access Organization A.
- User A cannot self-join Organization B.
- User B cannot self-join Organization A.
- User A cannot create a membership for User B.
- A user cannot insert an owner row when `organization_created_by` does not match the target organization's actual creator.
- non-owner initial role insertion is rejected.

Tests must not rely on service-role access as the authorization being tested.

If the repository currently lacks a runnable local Supabase database test harness, add the SQL test fixture/spec needed for later execution and clearly report that the remote isolation test remains a reviewer gate. Do not add new npm dependencies or invent database infrastructure.

## Application code

No application UI or tenant onboarding flow in this task.

Do not change:
- authentication flows
- /app UI beyond changes strictly required to keep the build working
- product routes
- integrations

## Required validation

Run:
- npm ci
- npm run lint
- npm run typecheck
- npm test
- npm run build

Existing GitHub Actions must pass.
Vercel Preview must build successfully.

## Git workflow

- one task = one branch = one PR
- suggested branch: `codex/tenant-001`
- Draft PR targeting main
- do not merge

## GitHub reporting

Required on the TENANT-001 Issue:
- `[CODEX:START]`
- `[CODEX:BLOCKED]` if needed
- `[CODEX:COMPLETE]`

## Completion criteria

PASS requires:

- migration creates only the approved tenant-foundation objects
- both tables match `docs/02_DATABASE.md`
- RLS is enabled on both tables
- policies match the approved rules
- no circular RLS dependency remains
- no SECURITY DEFINER functions/triggers/views are introduced
- no service-role bypass is introduced
- two-user/two-organization isolation tests/spec are present
- npm quality checks pass
- GitHub Actions passes
- Vercel Preview is Ready
- implementation report exists
- Draft PR exists and remains unmerged

Final approval additionally requires reviewer verification of tenant isolation against the approved development database before merge.
