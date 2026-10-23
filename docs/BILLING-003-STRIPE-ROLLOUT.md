# MatoMeet billing rollout (BILLING-003)

This branch is **not ready for production**. It adds foundational Checkout and webhook routes; the pricing UI and customer billing portal are a subsequent step.

## Live Stripe prices confirmed (2026-10-23)
- Standard JPY 2,500/month: `price_1URsciJo9YATKG9oiHpyFD8V`
- Pro JPY 9,800/month: `price_1URsdZJo9YATKG9oRGAJNKia`
- Lite: no Stripe price; free tier stored internally.

## Required server-side environment variables
Set on **the actual Next.js host**, not in browser code:
- `STRIPE_SECRET_KEY`: secret API key for the same live Stripe account.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the endpoint below.
- `STRIPE_STANDARD_PRICE_ID=price_1URsciJo9YATKG9oiHpyFD8V`
- `STRIPE_PRO_PRICE_ID=price_1URsdZJo9YATKG9oRGAJNKia`
- `APP_BASE_URL`: exact public origin, HTTPS only.
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) for signed webhook reconciliation.

Never commit actual secret values or publish them to the frontend. Keep live and test credentials separate.

## Stripe Dashboard webhook
Register: `https://<app-domain>/api/omnibox/billing/webhook`
Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Must complete before enabling for paying customers
1. Apply SQL migrations `20261023180000_billing_003_subscriptions.sql` and `20261023183000_billing_004_prevent_paid_downgrade.sql` in order; verify grants / RLS. The second prevents browser-side downgrade while Stripe billing is still active.
2. Make explicit plan-selection UI call Checkout and redirect to Stripe Checkout URL; add success/cancel user feedback.
3. Add a billing portal for existing subscribers, renewal, cancel and plan changes; don't create duplicate subscriptions.
4. Test valid/invalid webhook signatures, event retries, stale events, simultaneous callbacks, cancellation, failed payment, price changes, multiple organizations and demo users.
5. Check first-subscription events contain organization_id in subscription metadata.
6. Verify successful payment updates plan only via signed events; never trust browser success URL.
7. Validate subscription lifecycle events and race conditions using real Stripe test-mode account before production.
8. Apply compensating operational process for any billing records that could not reconcile and provide an owner-facing error state.
9. Ensure changes to the free-plan endpoint are consistent with active paid subscriptions and don't result in silently continuing charges.
10. Review changes and run CI, typecheck, lint, tests, migration verification and controlled end-to-end tests.

## New HTTP route
`POST /api/omnibox/billing/checkout` with body `{"plan":"standard"}` or `{"plan":"pro"}`; authenticated organization owners only. Returns `{"ok":true,"url":"https://checkout.stripe.com/..."}`. Explicitly blocks an existing paid subscription.

Do not enable this route to customers until the remaining items are completed.
