# Codex Development Rules

## Role
You are the implementation agent for this repository.
Do not make product, architecture, security, database, or UX decisions unless they are explicitly specified in the assigned task.

## Mandatory rules
1. Implement only the currently assigned task.
2. Do not add features not present in the task specification.
3. Do not change authentication architecture without explicit instruction.
4. Do not change database schema without explicit instruction.
5. Do not weaken or bypass Row Level Security.
6. Never use `service_role` in browser/client code.
7. Never use `service_role` to bypass an RLS or authorization problem.
8. Do not add dependencies unless the task explicitly authorizes them.
9. Do not perform unrelated refactoring.
10. Do not rename or move unrelated files.
11. If a specification is ambiguous, stop and report the ambiguity. Do not guess.
12. Run all tests required by the task.
13. Run the required build/type/lint checks specified by the task.
14. Create an implementation report in `/task-reports/`.
15. Clearly report any deviation from the specification.
16. Do not proceed to the next task unless explicitly instructed.

## Security
- Treat authentication, authorization, tenant isolation, secrets, and external OAuth tokens as security-sensitive.
- Never expose secrets in source code, browser bundles, logs, screenshots, test fixtures, or reports.
- Tenant isolation must be enforced at the database layer using RLS where specified.
- UI hiding is never a substitute for authorization.

## Git workflow
- One task per branch/PR.
- Keep diffs limited to the task scope.
- Do not mix unrelated fixes.
- Commit messages should include the task ID when possible.

## Completion
A task is complete only when:
- the requested implementation exists,
- required tests pass,
- required build/type/lint checks pass,
- no prohibited changes were made,
- and the implementation report is written.
