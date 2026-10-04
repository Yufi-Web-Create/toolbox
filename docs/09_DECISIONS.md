# Architecture Decision Register

Status: ACTIVE
Date: 2026-10-03

This file contains short, binding technical decisions for Codex.
When a task conflicts with this file, stop and report the conflict instead of choosing a different approach.

## D-001 Application type
Decision: Multi-tenant SaaS web application.

## D-002 Framework
Decision: Next.js 16.3.8.

## D-003 Router
Decision: App Router only.

## D-004 Language
Decision: TypeScript.

## D-005 Runtime
Decision: Node.js 24.

## D-006 Package manager
Decision: npm.

## D-007 Hosting
Decision: Vercel hosts the user-facing Next.js application.

## D-008 Backend platform
Decision: Supabase.

## D-009 Database
Decision: PostgreSQL via Supabase.

## D-010 Authentication
Decision: Supabase Auth.

## D-011 Session architecture
Decision: Cookie-based SSR using @supabase/ssr.

## D-012 Supabase clients
Decision: Browser and server clients must be separated.

## D-013 Authorization
Decision: PostgreSQL RLS is the primary tenant-data authorization boundary.

## D-014 Tenant model
Decision: Tenant-owned business data uses organization_id unless explicitly documented otherwise.

## D-015 ORM
Decision: No ORM during initial development.

## D-016 Client state
Decision: No global state-management library during initial development.

## D-017 UI library
Decision: No component library has been selected yet.

## D-018 Rendering
Decision: Prefer Server Components. Use Client Components only when browser-side behavior requires them.

## D-019 AI behavior
Decision: AI assists users; initial versions must not automatically send AI-generated replies.

## D-020 External integrations
Decision: Provider integrations must be isolated behind adapters.

## D-021 Source of truth
Decision: GitHub is the source of truth for specifications, implementation history, task communication, and pull requests.

## D-022 Codex role
Decision: Codex is an implementation agent, not a product or architecture decision-maker.

## D-023 Development Supabase
Decision: Use project `toolbox-dev` (ref `lrfjjqnsswrzuwpwtaei`) for development.

## D-024 Product naming
Decision: `toolbox` is an internal development/management codename only and is not the final customer-facing service name.

## D-025 Render provider bridge
Decision: The project owner has explicitly authorized Render as a trusted provider-webhook bridge runtime. The Next.js application remains hosted on Vercel. Render may receive verified provider webhooks and make provider API calls through provider adapters. It must not replace Supabase Auth or PostgreSQL RLS as the user/tenant authorization model. INBOX-001 initially limits this bridge to LINE.
