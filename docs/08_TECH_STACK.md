# Technical Baseline v0.1

Status: APPROVED FOR INITIAL DEVELOPMENT
Date: 2026-10-01

## Purpose

This document fixes the initial technical baseline for the project.
Codex must not replace these choices without an explicitly approved task.

## Application

- Framework: Next.js 16.3.8
- Router: App Router only
- Language: TypeScript
- Runtime: Node.js 24
- Package manager: npm
- Rendering model: Server Components by default
- Client Components: only when browser state or browser APIs are required

## Hosting

- Application hosting: Vercel
- Production deployments: from the protected main branch only
- Pull requests: use Vercel Preview deployments when available

## Database / Backend Platform

- Platform: Supabase
- Database: PostgreSQL
- Authentication: Supabase Auth
- Authorization: PostgreSQL Row Level Security (RLS)
- File storage: Supabase Storage
- Schema changes: SQL migrations only
- ORM: none for initial development

## Supabase client architecture

Use:
- @supabase/supabase-js
- @supabase/ssr

Required separation:
- browser client
- server client

Authentication sessions:
- cookie-based SSR sessions

Do not use:
- @supabase/auth-helpers-nextjs
- custom authentication
- service-role credentials in browser code
- client-side authorization as a substitute for server/database authorization

## Frontend styling

- Tailwind CSS may be used because the official Supabase Next.js template includes it.
- Do not introduce a component framework during infrastructure/auth phases.
- shadcn/ui or another component library requires a later explicit decision.

## State management

Initial rule:
- Do not install Redux, Zustand, MobX, or another global state library.
- Prefer Server Components, URL state, local React state, and server-side data fetching.
- Add a state library only when a concrete requirement justifies it.

## Forms and validation

Initial rule:
- No additional form library is required for infrastructure setup.
- Validation libraries may be added only through an approved task when real forms are implemented.

## Testing

### Static checks
- TypeScript type checking
- ESLint
- Production build

### Automated tests
- Vitest: unit and focused integration tests
- Playwright: browser/end-to-end tests for critical user flows

Critical flows include:
- signup
- login
- logout
- password reset
- protected routes
- tenant isolation
- later: inbox reply and social publishing workflows

## CI

GitHub Actions will eventually run:
1. install dependencies using npm ci
2. lint
3. typecheck
4. unit/integration tests
5. production build

Browser E2E execution in CI will be introduced when the application and test environment are ready.

## Git dependency policy

- package-lock.json must be committed.
- Dependencies must be installed with explicit task approval.
- Avoid wildcard dependency versions.
- Dependency upgrades must be intentional and reviewed.
- Security patches take priority over feature upgrades.

## Next.js policy

- Use App Router only.
- Do not create a Pages Router application.
- Prefer Server Components.
- Server Actions may be used only where specified.
- Route Handlers are used for webhook/API endpoints when appropriate.
- Provider integrations must remain behind adapters.

## External integrations

Planned providers:
- Gmail
- Google Calendar
- Instagram
- Facebook
- Threads
- X
- OpenAI

Each provider integration must be isolated so provider-specific payloads do not leak into core domain models.

## Secrets

- Local secrets: .env.local only
- Production/preview secrets: Vercel environment variables
- Supabase secrets must never be committed
- Provider OAuth tokens must never be logged
- service-role/secret keys are server-only and require explicit justification for each use

## Reliability principles

- An external API failure must never be recorded as success.
- Retry behavior must be explicitly designed per integration.
- Webhook handlers must eventually support duplicate-event protection/idempotency.
- AI failure must not block ordinary manual/template replies.
- Scheduled publishing must persist status and failure reason.
- Background jobs must be observable.

## Deferred decisions

The following are intentionally NOT decided yet:
- UI component library
- billing provider implementation
- job queue/provider
- observability vendor
- transactional email provider
- analytics platform
- cache layer
- search/vector database

These will be selected only when a requirement exists.

## Version policy

The baseline versions are intentionally fixed for initial development.

Do not automatically upgrade framework/runtime/dependencies during implementation.
Security updates are reviewed separately before upgrading.


## Development Supabase Project

- Project name: `toolbox-dev`
- Project ref: `lrfjjqnsswrzuwpwtaei`
- Region: `ap-northeast-1`
- Status at creation: `ACTIVE_HEALTHY`

This is a development infrastructure identifier only.
Do not treat `toolbox` as the final customer-facing service name.

No secret keys, passwords, or private environment variable values may be stored in this repository.
