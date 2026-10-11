# PLAN-002 — Monthly pricing and plan comparison cards

## User request

Set Lite to free, Standard to ¥6,980/month and Pro to ¥19,800/month, tax included. Improve both the appearance and content of the currently left-aligned plan cards.

## Implementation scope

- Update the server plan definitions and matching browser catalog.
- Center plan headings, prices, descriptions, features and selection controls.
- Align card sections at the top, use three equal desktop columns and one mobile column.
- Show current selection clearly and support keyboard focus and accessible selection state.
- Describe existing implemented functionality; retain the displayed AI monthly allowance accurately.
- Preserve existing permissions, employee/AI quotas, retired plans and payment-free switching. This task does not implement billing or unlimited usage.
- No database migrations, dependencies, authentication or provider changes.

## Verification

- Run existing tests, bridge tests, inline JavaScript syntax checks, lint, typecheck and production build.
- Inspect rendered cards at desktop and mobile widths, including selected state and overflow.
- Provide a task report and PR. Follow repository merge approval requirements.
