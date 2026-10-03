# TENANT-002 Implementation Report

## Task

TENANT-002 — Atomic organization bootstrap RPC

## Summary

Added one authenticated-only PostgreSQL RPC that creates an organization and
its creator's owner membership atomically with the caller's privileges. Added
the minimal server-side TypeScript wrapper and focused automated coverage. No
visible onboarding UI was added, and the migration was not applied to Supabase.

## Changed files

- `supabase/migrations/20261003011133_create_organization_with_owner.sql`
- `supabase/tests/tenant_002_atomic_organization_bootstrap.sql`
- `src/lib/organizations/server.ts`
- `src/lib/organizations/server.test.ts`
- `task-reports/TENANT-002.md`

## Added dependencies

None.

## Database changes

- Adds exactly one function:
  `public.create_organization_with_owner(p_name text) returns uuid`.
- The function is explicitly `SECURITY INVOKER` and has an empty
  `search_path`.
- It uses `auth.uid()` and fully qualified tables to insert the organization
  and its single `owner` membership within one function call.
- Default/public and anonymous execution are revoked; only `authenticated`
  receives execute permission.
- Existing tables, columns, constraints, indexes, RLS policies, triggers, and
  views are unchanged.
- The migration was not applied locally or remotely.

## Implementation details

- Organization names are trimmed in the RPC. The existing database constraint
  remains responsible for rejecting blank names.
- A missing authenticated user id fails closed before either insert.
- PostgreSQL statement/transaction semantics ensure a failed membership insert
  rolls back the preceding organization insert.
- The server-only wrapper uses the existing cookie-based Supabase server client
  and calls `rpc("create_organization_with_owner", { p_name: name })`.
- The wrapper returns a typed success/failure union and never exposes raw
  provider or database errors.

## Tests executed

- Wrapper success and exact RPC arguments.
- Existing database enforcement for blank names without duplicated application
  validation.
- Safe handling of provider/database errors, thrown exceptions, and unexpected
  RPC results.
- Repository SQL/spec coverage documents and exercises, when run against the
  reviewed migration:
  - explicit invoker security and empty search path,
  - authenticated-only execution,
  - independent creation by two users,
  - exactly one owner membership per created organization,
  - no cross-tenant membership,
  - existing TENANT-001 RLS visibility,
  - anonymous and missing-user rejection,
  - blank-name rejection,
  - atomic rollback after a deliberately forced membership insert failure.

## Validation commands

- `npm ci`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (14 files, 76 tests)
- `npm run build`: PASS
- `git diff --check`: PASS

## Results

Local application validation passed. The SQL/spec file was not executed against
`toolbox-dev` because this task explicitly prohibits applying the migration.
The reviewer must apply the reviewed migration and run the SQL/live gate before
final approval.

## Deviations from specification

None.

## Known issues

- Remote migration application and live RPC/RLS/atomicity verification are
  intentionally pending reviewer action on `toolbox-dev`.
- If Supabase assigns a different migration version, the existing migration
  file must be renamed within this same task and PR, followed by revalidation.

## Security notes

- No service-role credential or RLS bypass is used.
- No `SECURITY DEFINER`, trigger, view, or helper function was added.
- Function execution is granted to `authenticated` only and existing table RLS
  remains the authorization boundary.
- No credentials, tokens, cookies, provider errors, or database errors are
  exposed or logged.
