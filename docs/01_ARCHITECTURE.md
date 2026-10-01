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
- outbound/instagram
- outbound/threads
- outbound/facebook
- outbound/x
- calendar/google

Core domain logic must not depend directly on provider-specific payload formats.
