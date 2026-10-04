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

The first tenant milestone creates:

- `organizations`
- `organization_members`

The first inbox milestone, INBOX-001, additionally authorizes:

- `conversations`
- `messages`

Other customer, provider-connection, calendar, post, template, and knowledge tables remain future work.

## organizations

Columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`

Required constraints:

- `name` must not be blank after trimming.
- `unique (id, created_by)` must exist so memberships can enforce creator consistency with a composite foreign key.

Rules:

- `created_by` identifies the authenticated user who created the organization.
- RLS must be enabled.
- An authenticated user may insert an organization only when `created_by = auth.uid()`.
- A user may select an organization when:
  - they are the creator, or
  - they have their own membership row for that organization.
- Update and delete access are not authorized in the initial tenant task.

## organization_members

Columns:

- `organization_id uuid not null`
- `organization_created_by uuid not null`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role text not null`
- `created_at timestamptz not null default now()`

Required constraints:

- primary key: `(organization_id, user_id)`
- role limited to:
  - `owner`
  - `member`
- composite foreign key:
  - `(organization_id, organization_created_by)`
  - references `organizations(id, created_by)`
  - `on delete cascade`

Why `organization_created_by` exists:

- It deliberately duplicates the organization's creator id in the membership row.
- The composite foreign key guarantees it matches the creator stored on the target organization.
- This lets the initial owner-insert RLS policy verify ownership without querying `organizations`, avoiding a circular RLS dependency.
- This is an intentional denormalization for authorization safety in the initial tenant foundation.

Rules:

- RLS must be enabled.
- A user may select only their own membership rows.
- In the initial tenant task, a user may insert only:
  - their own membership row,
  - with role `owner`,
  - with `organization_created_by = auth.uid()`.
- Because of the composite foreign key, that owner row can only target an organization actually created by the same authenticated user.
- This prevents arbitrary self-joining of another organization.
- Adding other users, invitations, role changes, ownership transfer, membership deletion, and organization deletion are separate future tasks.
- No update or delete policy is authorized in the initial tenant task.

## Organization creation flow

Organization creation is performed through the approved TENANT-002 atomic RPC and exposed through TENANT-003 onboarding.

The database remains authoritative for organization name and ownership constraints.

## INBOX-001 conversations

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `provider text not null`
- `provider_thread_id text not null`
- `customer_external_id text not null`
- `customer_display_name text not null default 'LINE user'`
- `status text not null default 'unread'`
- `last_message_preview text not null default ''`
- `last_message_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- provider is limited to `line` in INBOX-001.
- status is limited to `unread`, `in_progress`, or `completed`.
- `unique (organization_id, provider, provider_thread_id)`.
- `unique (id, organization_id)` supports ownership-consistent message foreign keys.
- index `(organization_id, last_message_at desc)`.

RLS:

- enabled.
- authenticated users may select only rows for organizations where they have their own `organization_members` row.
- authenticated browser clients receive no insert, update, or delete grant in INBOX-001.

## INBOX-001 messages

Columns:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `conversation_id uuid not null`
- `provider_message_id text null`
- `direction text not null`
- `body text not null`
- `sent_by_user_id uuid null references auth.users(id) on delete set null`
- `created_at timestamptz not null default now()`

Constraints and indexes:

- direction is limited to `inbound` or `outbound`.
- body must not be blank after trimming.
- composite FK `(conversation_id, organization_id)` references `conversations(id, organization_id)`.
- `unique (organization_id, provider_message_id)` provides inbound provider idempotency when a provider id is present.
- indexes cover conversation ordering, the composite conversation FK, and `sent_by_user_id`.

RLS:

- enabled.
- authenticated users may select only rows for organizations where they have their own membership.
- authenticated browser clients receive no provider-data write grant in INBOX-001.
- the trusted provider bridge may use a server-only Supabase backend secret for verified LINE webhook writes and already-authorized outbound operations. That elevated credential must never be exposed to browsers and is not a substitute for RLS on user reads.

## RLS isolation expectations

At minimum, tests must prove:

- User A can read Organization A after owning/joining it.
- User B can read Organization B after owning/joining it.
- User A cannot read Organization B.
- User B cannot read Organization A.
- User A cannot insert themselves into Organization B.
- User B cannot insert themselves into Organization A.
- A user cannot insert a membership row for another user.
- A user cannot insert an owner row using an `organization_created_by` value that does not match the target organization's actual creator.
- A user cannot assign themselves a role other than the explicitly allowed initial owner creation path.
- A member can read conversations/messages for their organization.
- A member cannot read another organization's conversations/messages.
- The authenticated browser role cannot insert or update provider-owned conversation/message rows.

## Future candidate tables

Not authorized yet:

- profiles
- customers
- provider_connections
- templates
- knowledge_items
- posts
- post_destinations
- calendar_connections
- calendar_events

Each future tenant-owned business table must explicitly define its `organization_id`, foreign keys, indexes, and RLS policies before implementation.
