# SUPA-002 — Align migration history and index TENANT-001 composite foreign key

## Objective
Restore migration-history alignment between the repository and the linked Supabase project before any further database or tenant-onboarding work, and add the covering index currently reported by the Supabase performance advisor.

## Context
TENANT-001 is already merged and live-verified.

The linked Supabase project currently reports the applied migration:

- version: `20261002161423`
- name: `tenant_001_organization_membership_foundation`

The repository currently contains the same TENANT-001 migration under a different versioned filename:

- `supabase/migrations/20261002160703_tenant_001_organization_membership_foundation.sql`

This version mismatch must be corrected before future migrations are added, otherwise migration tooling may treat the already-applied TENANT-001 migration as unapplied.

Supabase Performance Advisor also reports one unindexed foreign key:

- table: `public.organization_members`
- constraint: `organization_members_organization_creator_fkey`
- columns: `(organization_id, organization_created_by)`

## Scope

### 1. Align the TENANT-001 migration filename
Rename:

`supabase/migrations/20261002160703_tenant_001_organization_membership_foundation.sql`

to:

`supabase/migrations/20261002161423_tenant_001_organization_membership_foundation.sql`

The SQL contents of the existing TENANT-001 migration must not change.

### 2. Add a new migration for the covering index
Create one new migration after version `20261002161423`.

It must add a covering B-tree index on:

`public.organization_members (organization_id, organization_created_by)`

Use a stable explicit index name:

`organization_members_organization_creator_idx`

The migration must be idempotent with `IF NOT EXISTS`.

### 3. Documentation/reporting
Create `task-reports/SUPA-002.md` describing:
- renamed migration file
- new migration filename
- exact schema change
- validation performed
- dependencies added: none
- deviations: none unless explicitly authorized

## Out of scope
Do not:
- alter existing TENANT-001 table definitions
- change RLS policies
- change foreign-key definitions
- add or remove columns
- modify auth behavior
- add tenant onboarding UI
- add organization creation flows
- introduce helper functions, triggers, views, service-role code, ORM, or new dependencies
- apply destructive SQL
- repair or rewrite Supabase migration history directly

## Acceptance criteria
- Repository TENANT-001 migration version matches the already-applied Supabase version `20261002161423`.
- Existing TENANT-001 SQL content is unchanged.
- Exactly one new migration adds the covering index.
- The index covers `(organization_id, organization_created_by)` in that order.
- No RLS or table-definition behavior changes.
- `npm ci` passes.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- Draft PR is opened against `main`.
- Final report is committed at `task-reports/SUPA-002.md`.

## Delivery protocol
Follow `docs/07_COMMUNICATION.md`.

Use:
- `[CODEX:START]`
- `[CODEX:PROGRESS]`
- `[CODEX:BLOCKED]`
- `[CODEX:COMPLETE]`

Do not merge the PR. Do not start another task after completion.
