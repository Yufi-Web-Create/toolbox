# TENANT-001 Implementation Report

## Task
TENANT-001

## Summary
Added the initial organization and membership schema, database constraints, least-privilege RLS policies, and a two-user/two-organization SQL isolation specification.

## Branch
`codex/tenant-001`

## Pull request
[Draft PR #24](https://github.com/Yufi-Web-Create/toolbox/pull/24), targeting `main`.

## Changed files
- `supabase/migrations/20261002160703_tenant_001_organization_membership_foundation.sql`
- `supabase/tests/tenant_001_organization_isolation.sql`
- `task-reports/TENANT-001.md`

## Database objects added
- `public.organizations`
- `public.organization_members`

No functions, triggers, views, or other application/domain tables are added.

## Migration
The migration was generated with Supabase CLI 2.119.0 and contains only the approved tenant foundation.

## RLS policies
- Authenticated users may insert organizations only with their own user id as `created_by`.
- Users may select organizations they created or organizations for which they can read their own membership.
- Users may select only their own membership rows.
- Users may insert only their own initial `owner` membership with `organization_created_by` equal to their authenticated user id.
- The membership INSERT policy does not query `organizations`, so no circular RLS dependency remains.
- No UPDATE or DELETE policy is added.

## Constraints
- Organization ids use UUID primary keys with `gen_random_uuid()` defaults.
- Organization names must remain non-blank after trimming.
- Organization creators and membership users reference `auth.users`.
- `(organizations.id, organizations.created_by)` is unique.
- Memberships use `(organization_id, user_id)` as their primary key.
- Membership roles are limited to `owner` and `member`.
- `(organization_id, organization_created_by)` references `(organizations.id, created_by)` with `ON DELETE CASCADE`, guaranteeing creator consistency without a policy lookup.

## Indexes
- `organizations_created_by_idx` supports creator-scoped RLS reads.
- `organization_members_user_id_idx` supports user-scoped membership RLS reads.
- Primary-key and unique constraints provide their required backing indexes.

## Tenant-isolation tests
The SQL specification covers two distinct users and two organizations, including:
- each user creating and reading their own organization and owner membership;
- cross-organization reads returning no rows;
- both users being unable to self-join the other's organization;
- rejection of membership creation for another user;
- rejection of mismatched organization creator ids;
- rejection of non-owner initial memberships;
- organization-name and role constraints.

Authorization cases run with the PostgreSQL `authenticated` role and per-user JWT claims. They do not use the Supabase `service_role` or a service-role credential. Privileged setup is limited to transaction-scoped test fixture creation and direct constraint checks.

The repository does not contain a runnable local Supabase database harness, and the environment does not provide a local database runtime. The SQL specification is included for later `supabase test db` execution. Verification against the approved development database remains a reviewer gate as required by the task.

## Remote database changes
None. No migration was applied to the development Supabase project.

## Application changes
None.

## Dependencies added
None.

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
- `npm test`: PASS (12 test files, 56 tests)
- `npm run build`: PASS
- SQL/RLS isolation specification: NOT RUN locally; repository/environment has no runnable local Supabase database harness, and approved development-database verification remains the reviewer gate.

## Security review notes
- RLS is enabled on both exposed-schema tables.
- Table privileges are limited to SELECT and INSERT for `authenticated`; `anon` receives none.
- No service-role bypass, SECURITY DEFINER function, helper function, trigger, or view is introduced.
- The composite foreign key enforces organization creator consistency without cross-table lookup in membership INSERT RLS.

## Deviations
None.

## Known issues
- The SQL isolation specification could not be executed locally because no local Supabase database harness is present; remote tenant-isolation verification remains the explicit reviewer gate.
