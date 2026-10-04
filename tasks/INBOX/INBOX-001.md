# INBOX-001 — LINE live inbound/outbound vertical slice

## Objective

Implement the first real provider integration path for the product:

LINE customer message -> verified webhook -> tenant-scoped inbox -> authenticated human reply -> LINE customer.

This task is intentionally narrow. It proves the full integration architecture without adding other SNS providers or final product UI.

## Owner authorization

The project owner explicitly authorized Render for the server/webhook layer and asked for implementation to proceed as far as possible.

For this task, the existing Vercel-hosted Next.js application remains the user-facing web application. Render is introduced only as the trusted provider bridge for inbound LINE webhooks and outbound LINE API calls.

## Binding architecture

Follow:

- docs/00_PRODUCT.md
- docs/01_ARCHITECTURE.md
- docs/02_DATABASE.md
- docs/03_AUTH.md
- docs/04_SECURITY.md
- docs/05_UI.md
- docs/07_COMMUNICATION.md
- docs/09_DECISIONS.md
- docs/10_DO_NOT_DECIDE.md

## User flow

1. An authenticated user completes organization onboarding.
2. LINE sends a webhook to the Render bridge.
3. The bridge verifies the LINE signature against the exact raw request body before parsing or processing the event.
4. A supported LINE text event is normalized and stored as a tenant-owned conversation/message.
5. The authenticated user opens /app/inbox and sees only conversations visible through existing tenant RLS.
6. The user selects a conversation and submits a human-written reply.
7. The Next.js Server Action verifies authentication and RLS visibility of the conversation.
8. The Server Action calls the trusted Render bridge using a server-only internal secret.
9. The bridge confirms the conversation belongs to its configured organization, sends the text through the LINE Messaging API, and records the outbound message only after LINE accepts the send request.
10. The user refreshes or revisits the inbox and sees the outbound message.

## First-slice provider configuration

This task supports one development LINE Official Account mapped to one organization.

The mapping is server configuration, not browser state:

- OMNIBOX_ORGANIZATION_ID
- LINE_CHANNEL_SECRET
- LINE_CHANNEL_ACCESS_TOKEN

Multi-account connection records and OAuth onboarding are later tasks.

## Database

Create public.conversations and public.messages.

Every business row carries organization_id.

### conversations

Required fields:

- id uuid primary key
- organization_id uuid not null
- provider text not null
- provider_thread_id text not null
- customer_external_id text not null
- customer_display_name text not null
- status text not null
- last_message_preview text not null
- last_message_at timestamptz not null
- created_at timestamptz not null
- updated_at timestamptz not null

Constraints:

- provider is line for this task
- status is unread, in_progress, or completed
- unique organization/provider/provider_thread_id
- composite unique id/organization_id for message ownership integrity

### messages

Required fields:

- id uuid primary key
- organization_id uuid not null
- conversation_id uuid not null
- provider_message_id text nullable
- direction text not null
- body text not null
- sent_by_user_id uuid nullable
- created_at timestamptz not null

Constraints:

- direction is inbound or outbound
- body is not blank
- conversation and message organization ids must match through a composite foreign key
- provider message ids are idempotent per organization when present

### RLS

- Enable RLS on both tables.
- Authenticated browser/application users receive SELECT access only.
- A row is visible only when the authenticated user has an organization_members row for the same organization_id.
- No browser/client insert or update policy is added in this task.
- Provider bridge writes use a server-only Supabase backend secret in the trusted Render environment.
- Elevated backend credentials are not a substitute for browser authorization and must never reach the browser.

## Next.js inbox

Add /app/inbox.

Requirements:

- protected with existing getClaims() server auth architecture
- zero organization redirects to /app/onboarding
- conversations and messages are read with the request-scoped user Supabase client so RLS remains authoritative
- selecting a conversation must not bypass RLS
- safe empty and provider-error states
- minimal UI only; no final design-system decision

## Reply action

The reply mutation must:

- run server-side
- require trusted authenticated claims
- verify the requested conversation is visible to the authenticated user before contacting the provider bridge
- validate a non-empty text body with a 5000 character maximum
- send only human-submitted text
- never expose the bridge internal key to the browser
- return generic safe errors
- revalidate the inbox after success

## LINE provider bridge

Use a Node server that can run on Render.

### Public endpoint

POST /webhooks/line

Requirements:

- retain exact raw bytes
- verify x-line-signature using HMAC-SHA256 and LINE_CHANNEL_SECRET before JSON parsing
- invalid signature -> reject without processing
- LINE verification payload with an empty events array -> 200
- support text message events with a user source
- unsupported event types -> acknowledge without creating business rows
- best-effort LINE profile lookup may populate customer_display_name
- deduplicate inbound messages by provider_message_id
- no provider secret/token logging

### Internal endpoint

POST /internal/line/reply

Requirements:

- require a server-only bearer value LINE_BRIDGE_INTERNAL_KEY
- verify conversation id exists and belongs to OMNIBOX_ORGANIZATION_ID
- validate text body
- call LINE Messaging API push endpoint
- LINE failure -> safe error and no successful outbound message record
- LINE success -> insert outbound message and update conversation preview/status
- sent_by_user_id may be recorded from the already-authenticated Next.js server action

### Health endpoint

GET /health

Returns service health without revealing any secret values. It may report whether required configuration is present.

## Environment variables

### Vercel / Next.js server

- LINE_BRIDGE_URL
- LINE_BRIDGE_INTERNAL_KEY

### Render bridge

- SUPABASE_URL
- SUPABASE_SECRET_KEY
- OMNIBOX_ORGANIZATION_ID
- LINE_CHANNEL_SECRET
- LINE_CHANNEL_ACCESS_TOKEN
- LINE_BRIDGE_INTERNAL_KEY
- PORT

No real value may be committed.

## Testing

Required automated coverage:

- inbox data access returns safe errors and uses RLS-bound client reads
- reply action rejects unauthenticated/invisible/blank input
- reply action calls adapter only for a visible conversation
- LINE adapter sends bridge request server-side and fails safely
- bridge signature verification accepts a correct signature and rejects a wrong one
- bridge normalizes supported text events and ignores unsupported events
- bridge health works without secrets
- bridge rejects unconfigured live endpoints safely

Database verification must confirm:

- RLS enabled on conversations/messages
- cross-organization read isolation
- browser-authenticated role cannot insert or update provider data
- required foreign-key indexes exist
- Supabase advisors are reviewed after migration

## Required validation

Run:

- npm ci
- npm run lint
- npm run typecheck
- npm test
- node --test server/line-bridge.test.mjs
- npm run build
- GitHub Actions quality gate
- Render /health

## Out of scope

- Instagram
- Facebook Messenger
- Gmail
- X
- Threads
- provider OAuth/account-connection UI
- database token storage for multiple LINE accounts
- queues/retry workers
- media/attachment messages
- AI automatic sending
- final OmniBox visual redesign
- organization switching
- merging pull requests

## Git workflow

- branch: codex/inbox-001
- Draft PR targeting main
- do not merge
- implementation report: task-reports/INBOX-001.md
- use required GitHub status reports
