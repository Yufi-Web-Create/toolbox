# Decisions Codex Must Not Make

Status: ACTIVE
Date: 2026-10-03

This file lists decisions that require explicit approval from the project owner/reviewer.
Codex must not select, change, or infer these choices on its own.

## Architecture
Codex must not:
- replace Next.js with another framework
- introduce Pages Router
- replace Supabase
- introduce an ORM
- introduce a global state-management library
- introduce Redis, queues, caches, or background-job infrastructure
- introduce a separate general-purpose backend framework or API server
- expand the owner-approved Render provider bridge beyond the provider/task scope documented in D-025 without a new approved task

## Authentication and security
Codex must not:
- create custom authentication
- change session strategy
- weaken or bypass RLS
- use elevated Supabase credentials to solve ordinary browser/user authorization failures
- place server secrets in browser-accessible environment variables
- create SECURITY DEFINER database functions as a permission workaround
- use user-editable metadata for authorization

## Database
Codex must not:
- create or alter tables without an approved task
- change organization/tenant ownership rules
- remove RLS
- add views, functions, triggers, or extensions without explicit instruction
- apply destructive migrations without explicit approval

## Dependencies
Codex must not:
- add packages unless the assigned task authorizes them
- upgrade framework/runtime/package versions automatically
- replace npm with another package manager

## UI / product
Codex must not:
- choose the final product/service name
- choose a design system or component library
- add screens or features that are not specified
- change navigation or workflows for convenience
- make product-policy decisions

## External providers
Codex must not:
- switch providers
- change OAuth scopes
- add new third-party integrations outside an approved task
- invent retry, queue, or token-storage strategies without an approved design
- expose provider or bridge secrets to browser code

## Workflow
Codex must not:
- start the next task automatically
- merge its own PR
- treat PR creation as approval
- skip tests because a change appears small
- mark a task PASS if required checks were not executed
- make a judgment call when the specification is ambiguous

## Required response to ambiguity
When any of the above decisions becomes necessary:
1. Stop implementation.
2. Post `[CODEX:BLOCKED]` on the task Issue.
3. Describe the exact decision required.
4. Provide factual options if useful.
5. Wait for explicit instruction.
