# Authentication Specification

Status: APPROVED
Updated: 2026-10-01

## Baseline

- Authentication provider: Supabase Auth
- Framework: Next.js 16 App Router
- Session storage: cookie-based SSR sessions through `@supabase/ssr`
- Browser and server Supabase clients remain separated
- Session refresh is performed at the request layer with Next.js `proxy.ts`
- Protected routes are checked on the server
- Database authorization and tenant isolation are enforced with PostgreSQL RLS
- No custom JWT/session implementation

## Authentication method

Initial supported method:
- Email + password

Not in the initial auth milestone:
- Google OAuth
- Apple login
- magic-link-only login
- social login
- passkeys
- SMS login

These may be considered later through separate approved tasks.

## Required routes

Public routes:
- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/auth/callback`
- `/update-password`

Protected application root:
- `/app`

All product pages will eventually live under `/app/*` unless explicitly decided otherwise.

## Session lifecycle

1. Browser holds Supabase Auth session in cookies.
2. Next.js `proxy.ts` runs for routes that need Supabase session awareness.
3. Proxy creates a request-scoped Supabase client.
4. Proxy calls `supabase.auth.getClaims()` to validate/refresh the token.
5. Any refreshed cookies are written to both the request and response.
6. Server Components use the server Supabase client for request-scoped access.

Do not use `getSession()` as the trusted server-side authorization check.

## Protection rules

For protected routes:
- No authenticated claims -> redirect to `/login`.
- Authenticated claims -> continue.
- Protection is enforced server-side.
- Client-side hiding is never treated as authorization.

For public auth routes:
- An authenticated user who visits `/login` or `/signup` may later be redirected to `/app`, but that redirect behavior will be implemented only in its assigned task.

## Email verification

Initial policy:
- Email verification is required before the account is treated as ready for normal application use.
- Signup behavior and verification callback handling are implemented in separate tasks.
- Do not silently bypass verification in application code.

## Password reset flow

Planned flow:
1. User requests reset from `/forgot-password`.
2. Supabase sends recovery email.
3. Recovery callback is processed through `/auth/callback`.
4. User is sent to `/update-password`.
5. User chooses a new password.
6. User returns to the normal authenticated flow.

## Redirect safety

- Redirect targets must be controlled by the application.
- Never trust an arbitrary external redirect URL from query parameters.
- Any optional next/redirect parameter must be validated as a local application path.

## Error behavior

Authentication errors must:
- show a user-readable message
- not expose tokens, stack traces, provider secrets, or raw credentials
- preserve enough information for debugging through safe logs when logging is later introduced

Do not reveal whether an unrelated email address belongs to another tenant.

## Security rules

- Never use service-role credentials in browser/client code.
- Do not use service-role credentials for ordinary login/session operations.
- Never bypass RLS to fix an auth problem.
- Never use user-editable metadata as the source of authorization.
- Do not trust client state as proof of authentication.
- Do not log passwords, refresh tokens, access tokens, OAuth codes, cookies, or secret keys.
- Authenticated routes must not use ISR because session refresh may set cookies.
- Authentication and session-sensitive responses must not be shared across users through caching.

## Implementation sequence

Authentication work is intentionally split into narrow tasks:

### AUTH-001 — Session refresh proxy
- Add `proxy.ts`
- Add request session-refresh helper
- Validate/refresh claims
- No login/signup UI

### AUTH-002 — Signup
- Signup page/form
- Email/password signup action
- User-readable errors
- No tenant creation yet

### AUTH-003 — Verification callback
- `/auth/callback`
- PKCE/code exchange handling
- Controlled redirect handling

### AUTH-004 — Login
- Login page/form
- Email/password login action
- Authenticated session creation

### AUTH-005 — Logout
- Server-side logout action
- Cookie/session termination
- Redirect to login

### AUTH-006 — Protected application shell
- `/app`
- Server-side claim check
- Unauthenticated redirect to `/login`

### AUTH-007 — Password recovery
- forgot-password
- callback/recovery handling
- update-password

## Completion gate

Inbox, external provider integrations, and tenant-owned business data must not begin until:
- authentication flows pass,
- protected routes are verified,
- tenant isolation/RLS tests pass in the later tenant milestone.

## Prohibited

- Custom authentication implementation
- Client-only authorization
- Browser use of service-role credentials
- RLS bypass as a workaround
- Combining several auth milestones into one task without explicit approval
