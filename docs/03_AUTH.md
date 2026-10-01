# Authentication Specification

Status: DRAFT

## Baseline
- Supabase Auth
- Cookie-based session for Next.js SSR
- Separate browser and server Supabase clients
- Server-side protection for protected routes
- RLS for authorization and tenant isolation

## Development gate
Inbox development must not begin until the authentication and tenant-isolation test suite passes.

## Prohibited
- Custom authentication implementation
- Client-only authorization
- Browser use of service-role credentials
- RLS bypass as a workaround
