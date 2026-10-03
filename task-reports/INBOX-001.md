# INBOX-001 Implementation Report

## Task

INBOX-001 — LINE live inbound/outbound vertical slice

## Summary

Implemented the first provider integration vertical slice for LINE on top of the
existing Supabase Auth and tenant foundation.

The implementation now contains:

- tenant-owned conversations and messages in Supabase
- RLS-protected authenticated inbox reads
- a minimal protected `/app/inbox` page
- a server-side human reply action
- a server-only LINE provider adapter
- a Render-hostable LINE webhook/reply bridge
- exact raw-body webhook signature verification
- provider message idempotency
- automated application and bridge tests
- a deployed Render service shell

Live LINE traffic is intentionally still disabled until the required provider and
server credentials are configured.

## Changed files

- `.env.example`
- `.github/workflows/quality-gate.yml`
- `docs/01_ARCHITECTURE.md`
- `docs/02_DATABASE.md`
- `docs/09_DECISIONS.md`
- `docs/10_DO_NOT_DECIDE.md`
- `package.json`
- `server/line-bridge.mjs`
- `server/line-bridge.test.mjs`
- `src/app/app/inbox/actions.ts`
- `src/app/app/inbox/actions.test.ts`
- `src/app/app/inbox/page.tsx`
- `src/app/app/inbox/page.module.css`
- `src/app/app/inbox/reply-form.tsx`
- `src/app/app/page.tsx`
- `src/app/app/page.test.tsx`
- `src/lib/inbox/server.ts`
- `src/lib/inbox/server.test.ts`
- `src/lib/integrations/line/server.ts`
- `src/lib/integrations/line/server.test.ts`
- `supabase/migrations/20261003050638_inbox_001_line_vertical_slice.sql`
- `supabase/migrations/20261003050701_inbox_001_cover_message_foreign_keys.sql`
- `supabase/tests/inbox_001_line_isolation.sql`
- `tasks/INBOX/INBOX-001.md`
- `task-reports/INBOX-001.md`

## Dependencies added

None.

The Render bridge uses Node.js built-ins plus the repository's existing
`@supabase/supabase-js` dependency.

## Database changes

Applied to development Supabase project `toolbox-dev`
(`lrfjjqnsswrzuwpwtaei`):

1. `20261003050638_inbox_001_line_vertical_slice`
   - creates `public.conversations`
   - creates `public.messages`
   - enables RLS on both
   - adds organization-membership SELECT policies
   - grants authenticated clients SELECT only
   - grants the trusted backend role the write operations required by the provider bridge
2. `20261003050701_inbox_001_cover_message_foreign_keys`
   - adds covering indexes for the composite conversation FK and `sent_by_user_id`

Post-migration direct inspection confirmed:

- `conversations`: RLS enabled
- `messages`: RLS enabled
- authenticated role: SELECT allowed
- authenticated role: INSERT denied
- authenticated role: UPDATE denied
- both SELECT policies require a matching `organization_members` row for `auth.uid()`

The Supabase performance advisor initially reported two unindexed foreign keys.
The second migration fixed both. The remaining performance notices are only
unused-index informational notices expected for newly-created empty tables.

The Supabase security advisor reports one existing Auth-level warning:
Leaked Password Protection is disabled. This task did not change Auth settings.

A pgTAP two-tenant isolation test is committed at
`supabase/tests/inbox_001_line_isolation.sql`. A live two-user execution was
not performed because the development project currently has only one Auth user,
and creating temporary Auth users through the available database tool was
blocked by tool safety. The policy/grant structure was inspected directly.

## Application behavior

### /app/inbox

- requires trusted server-side Supabase claims
- redirects unauthenticated users to `/login?next=/app/inbox`
- redirects zero-organization users to existing onboarding
- loads only RLS-visible conversations
- only loads messages for a conversation selected from that visible result set
- includes safe empty and provider-error states
- displays inbound/outbound LINE messages
- includes a human reply form

### Reply action

- validates a non-empty reply up to 5000 characters
- revalidates trusted authentication
- verifies conversation visibility with the user's RLS-bound Supabase client
- calls the LINE adapter only after that authorization check
- keeps the internal bridge secret server-side
- revalidates `/app/inbox` only after a successful bridge send
- returns fixed safe messages instead of provider/database internals

## Render LINE bridge

Created Render service:

- name: `omnibox-line-bridge`
- workspace: `OmniBox`
- repo: `Yufi-Web-Create/toolbox`
- branch: `codex/inbox-001`
- start command: `node server/line-bridge.mjs`
- public URL: `https://omnibox-line-bridge.onrender.com`

The service successfully built with Node.js 24 and reached Render Live state.
Runtime logs confirmed the bridge listening on Render's assigned port.

`SUPABASE_URL` was configured with the development Supabase URL. No secret
provider values were invented or committed.

### GET /health

- responds without provider credentials
- reports service availability and whether required live configuration is complete
- covered by the Node bridge test suite

### POST /webhooks/line

- fails closed while configuration is incomplete
- reads exact raw request bytes
- verifies `x-line-signature` with HMAC-SHA256 before JSON parsing
- supports LINE user text message events
- ignores unsupported event types
- performs best-effort LINE profile lookup
- upserts a tenant-owned LINE conversation
- deduplicates inbound messages by provider message id

### POST /internal/line/reply

- requires server-only bearer authentication
- validates UUID/text input
- verifies the target conversation belongs to the bridge's configured organization
- sends through LINE Messaging API push
- never records a successful outbound message before LINE accepts the send
- records the authenticated application user id on outbound messages
- updates the conversation preview/status after persistence

## Automated validation

GitHub Actions Quality gate on commit
`10debeb855e0b8671f89bb0188e4f1f7437d4acc`: PASS.

Steps:

- npm ci: PASS
- npm run lint: PASS
- npm run typecheck: PASS
- npm test: PASS
  - 19 Vitest files
  - 106 tests
- npm run test:bridge: PASS
  - 5 Node-native bridge tests
  - 0 failures
- npm run build: PASS
  - Next.js production build compiled successfully

The first CI attempt exposed that Vitest also discovered the Node-native bridge
test filename. `npm test` was corrected to exclude that file while
`npm run test:bridge` executes it explicitly. The subsequent full quality gate
passed.

Vercel's GitHub integration reports the PR preview as Ready.

## Pull request

- Draft PR: #36
- branch: `codex/inbox-001`
- base: `main`
- status: open, Draft
- mergeable: true
- not merged

This branch is stacked on the still-unmerged TENANT-003 work, because the inbox
depends on its organization onboarding foundation.

## Live activation still required

The code path is implemented, but real LINE messages cannot be accepted/sent
until server-side configuration is supplied.

Render still requires:

- `SUPABASE_SECRET_KEY`
- `OMNIBOX_ORGANIZATION_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_BRIDGE_INTERNAL_KEY`

The Vercel Next.js server requires:

- `LINE_BRIDGE_URL=https://omnibox-line-bridge.onrender.com`
- the same `LINE_BRIDGE_INTERNAL_KEY`

The current development database contains zero organizations, so
`OMNIBOX_ORGANIZATION_ID` cannot be truthfully configured until the existing
onboarding flow creates the first organization.

The available Vercel connector could not access the project's scope for direct
environment mutation, so no Vercel secret was changed.

After those values exist, the LINE Developers webhook URL is:

`https://omnibox-line-bridge.onrender.com/webhooks/line`

## Known limitations

INBOX-001 intentionally supports:

- one development LINE Official Account
- one organization mapping
- text messages from LINE user conversations
- push-based human replies

It does not yet implement:

- account connection UI/OAuth
- multiple LINE accounts
- Instagram/Facebook/Gmail/X/Threads
- media or attachments
- retry queues/background processing
- final OmniBox visual UI
- AI automatic sending

## Result

Implementation and automated validation: PASS.

Render deployment shell: PASS / Live.

Real LINE end-to-end activation: PENDING required external credentials and the
first real organization id.

No PR was merged.
