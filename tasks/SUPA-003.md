# SUPA-003 — Align applied index migration filename with Supabase history

## Objective
Restore repository/remote migration-history alignment after SUPA-002 was applied to the linked Supabase project.

## Context
SUPA-002 has been merged and the covering index migration has been applied successfully.

Remote Supabase migration history now records:
- version: `20261003005518`
- name: `add_organization_members_creator_index`

The repository currently contains:
- `supabase/migrations/20261003004241_add_organization_members_creator_index.sql`

The SQL was already applied successfully. Only the versioned filename is misaligned.

## Scope

### 1. Rename the applied index migration file
Rename:

`supabase/migrations/20261003004241_add_organization_members_creator_index.sql`

to:

`supabase/migrations/20261003005518_add_organization_members_creator_index.sql`

The SQL contents must not change.

### 2. Documentation/reporting
Create `task-reports/SUPA-003.md` documenting:
- old filename
- new filename
- confirmation that SQL content is unchanged
- confirmation that no remote Supabase change was made
- validation performed
- dependencies added: none
- deviations: none unless explicitly authorized

## Out of scope
Do not:
- add, remove, or modify SQL
- apply any migration to Supabase
- edit Supabase migration history
- change tables, indexes, RLS, foreign keys, Auth, UI, or dependencies
- begin tenant onboarding

## Acceptance criteria
- Repository filename matches remote migration version `20261003005518`.
- SQL content is byte-for-byte unchanged.
- No new migration is added.
- No remote DB changes are made.
- `npm ci` passes.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- Draft PR is opened against `main`.
- Final report is committed at `task-reports/SUPA-003.md`.

## Delivery protocol
Follow `docs/07_COMMUNICATION.md`.

Use:
- `[CODEX:START]`
- `[CODEX:PROGRESS]`
- `[CODEX:BLOCKED]`
- `[CODEX:COMPLETE]`

Do not merge the PR. Do not start another task after completion.
