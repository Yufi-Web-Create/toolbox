# Architecture v0.1

## Baseline
- Web application: Next.js
- Database: PostgreSQL via Supabase
- Authentication: Supabase Auth
- Authorization: Supabase RLS
- File storage: Supabase Storage
- Hosting target: Vercel
- Source control: GitHub
- AI provider: OpenAI API

## Integration architecture
External services must be isolated behind adapters.

Examples:
- inbound/gmail
- inbound/instagram
- inbound/facebook
- inbound/line
- outbound/instagram
- outbound/threads
- outbound/facebook
- outbound/x
- outbound/line
- calendar/google

Core domain logic must not depend directly on provider-specific payload formats.

## Provider bridge runtime

The owner-authorized INBOX-001 LINE integration uses a small trusted provider bridge on Render.

Responsibilities are deliberately split:

- Vercel / Next.js:
  - authenticated user interface
  - Supabase Auth session validation
  - RLS-bound tenant reads
  - server-side authorization before an outbound provider action
- Render provider bridge:
  - public LINE webhook endpoint
  - LINE webhook signature verification against the exact raw request body
  - LINE Messaging API calls
  - provider secret handling
  - provider-to-core payload normalization

The Render bridge is not a replacement application backend and must not become a general authorization bypass. Browser-facing tenant authorization remains Supabase Auth + PostgreSQL RLS.

For INBOX-001, one development LINE Official Account is mapped to one organization with server environment configuration. Multi-account provider connections and OAuth are separate tasks.
