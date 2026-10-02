# Database Design

Status: APPROVED
Updated: 2026-10-03

## Core rules

- Multi-tenant from day one.
- Tenant-owned business data must carry `organization_id` unless explicitly documented otherwise.
- PostgreSQL RLS is the primary tenant-data authorization boundary.
- Tenant separation must be tested with at least two organizations and two distinct users.
- Database schema changes require an approved task.
- No service-role bypass is allowed as a substitute for correct RLS.

## Initial tenant foundation

The first tenant milestone creates only:

- `organizations`
- `organization_members`

No customer, conversation, message, provider, calendar, post, template, or knowledge tables are created in this milestone.

## organizations

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`

Rules:

- `name` must not be blank after trimming.
- `created_by` identifies the authenticated user who created the organization.
- RLS must be enabled.
- An authenticated user may insert an organization only when `created_by = auth.uid()`.
- A user may select an organization when:
  - they are the creator, or
  - they have their own membership row for that organization.
- Update and delete access are not authorized in the initial tenant task.

## organization_members

Columns:

- `organization_id uuid not null references organizations(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role text not null`
- `created_at timestamptz not null default now()`
- primary key: `(organization_id, user_id)`

Initial allowed role values:

- `owner`
- `member`

Rules:

- RLS must be enabled.
- A user may select only their own membership rows.
- In the initial tenant task, a user may insert only:
  - their own membership row,
  - with role `owner`,
  - for an organization they themselves created.
- This prevents arbitrary self-joining of another organization.
- Adding other users, invitations, role changes, ownership transfer, membership deletion, and organization deletion are separate future tasks.
- No update or delete policy is authorized in the initial tenant task.

## Creation flow

Initial organization creation is intentionally two-step and server-controlled:

1. Insert `organizations` with `created_by = auth.uid()`.
2. Insert the creator's `organization_members` row with role `owner`.

No trigger or SECURITY DEFINER function is introduced for this milestone.

If either step fails, application code must not pretend organization setup succeeded. A later application task will define the UI/workflow and transaction strategy before onboarding is exposed to users.

## RLS isolation expectations

At minimum, tests must prove:

- User A can read Organization A after owning/joining it.
- User B can read Organization B after owning/joining it.
- User A cannot read Organization B.
- User B cannot read Organization A.
- User A cannot insert themselves into Organization B.
- User B cannot insert themselves into Organization A.
- A user cannot insert a membership row for another user.
- A user cannot assign themselves a role other than the explicitly allowed initial owner creation path.

## Future candidate tables

Not authorized yet:

- profiles
- customers
- conversations
- messages
- templates
- knowledge_items
- posts
- post_destinations
- calendar_connections
- calendar_events

Each future tenant-owned business table must explicitly define its `organization_id`, foreign keys, indexes, and RLS policies before implementation.
