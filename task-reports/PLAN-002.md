# PLAN-002 — Monthly pricing and plan comparison cards

## Implementation

- Lite: ¥0; Standard: ¥6,980; Pro: ¥19,800 per month, tax included.
- Updated both `src/lib/plans.ts` and the browser catalog in `public/omnibox.html`.
- Centered card contents with larger prices, explicit tax/month labels, matching top sections, four feature rows and bottom-aligned selection labels.
- Three equal desktop columns and one mobile column; added selected-state ARIA and keyboard focus styling.
- Rewrote copy around LINE management, unified inquiry/SNS management and AI assistance. Kept the actual 500/month AI allowance visible; did not advertise unlimited usage.
- Preserved permissions, quotas, retired-plan handling and payment-free switching. No dependencies or database changes.

## Validation

- `npm run build`: PASS, including inline JavaScript check; 46 pages generated.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with three existing Next.js image warnings in unchanged files.
- `git diff --check`: PASS.
- `npm test`: 161/162 PASS. The existing warm-neutral styling test fails on the unrelated `chat-recipient-account-badge` class. An untouched worktree at base `cf7dcae` reproduces the identical 161/162 result.
- `npm run test:bridge`: 4/6 PASS. The existing health and webhook-status tests fail identically in the untouched baseline worktree. Bridge code was not changed.
- Desktop/mobile visual verification: NOT COMPLETED. No Chromium executable is installed; downloading the runtime browser fails with a truncated archive. Responsive CSS was inspected, but rendered layout must still be reviewed.

## Release status

Prepared as a separate branch/PR, not merged or deployed to production. Repository rules require separate merge authorization.

Vercel project discovery identified `toolbox` (`prj_3joeA6f1UqgJKmvrfZWu6eJCPQYl`) in team `team_VFhfi49AKEY2caJ9ntzEaknR`. Deployment inspection for that exact scope failed with HTTP 403. No Vercel CLI is available as a fallback. Production/preview deployment status has not been verified.

## Overall verification status

Incomplete: implementation and build/type/lint checks are complete; inherited test failures and browser inspection limitations are documented rather than marked as passing. No unrelated fixes were made.
