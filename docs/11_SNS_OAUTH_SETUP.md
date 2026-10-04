# OmniBox SNS / messaging connection setup

OmniBox is designed so store users connect their own social or mail account through official provider authorization flows. Instagram, X, and Google users do not paste provider passwords or developer secrets into OmniBox. LINE is currently the exception because its Messaging API channel requires a one-time Channel ID / Channel Secret setup.

## Responsibility split

### OmniBox operator

The OmniBox operator prepares the developer application once per provider and stores Client IDs / Client Secrets only in the deployment environment.

The operator must:

1. Create or select the provider developer app.
2. Enable the products and scopes OmniBox needs.
3. Register the exact OmniBox callback URL.
4. Store provider Client IDs and secrets as server-side environment variables.
5. Complete any provider review, production approval, pricing, or access-tier requirements.
6. Confirm webhook / event delivery where the provider requires it.

### Store / tenant user

The store user operates only from OmniBox:

1. Open 接続アカウント.
2. Choose 新規アカウントを追加.
3. Choose the provider.
4. For Instagram / X / Google, continue to the provider's official OAuth screen and grant access.
5. For LINE, enter the Messaging API Channel ID and Channel Secret once.
6. Confirm that the account card shows an active connection.

## LINE Messaging API

LINE uses the live bridge:

https://omnibox-line-bridge.onrender.com/webhooks/line

### LINE Developers preparation

1. Open LINE Developers and create or select a Provider.
2. Create or select a Messaging API channel for the LINE Official Account.
3. Confirm the channel's Channel ID.
4. Confirm the channel's Channel Secret.
5. In OmniBox, choose 新規アカウントを追加 → LINE.
6. Enter Channel ID, Channel Secret, and the display name for the account.
7. OmniBox obtains a short-lived channel access token, sets the webhook endpoint, runs LINE's webhook test endpoint, and confirms whether the webhook is active.
8. Send a test message to the LINE Official Account and confirm it appears in OmniBox.

### LINE recovery when inbound messages stop

The connected-accounts screen exposes Webhookを診断・再設定 to an organization owner.

The operation:

1. Uses the LINE credentials already stored by the bridge.
2. Checks LINE API reachability.
3. Re-applies the expected OmniBox webhook URL.
4. Runs LINE's webhook test.
5. Reads the webhook endpoint and active state back from LINE.
6. Shows whether the endpoint matches the OmniBox bridge URL.

No Channel Secret needs to be entered again for this repair operation.

## Instagram / Meta

### Operator preparation

1. Create a Meta developer app suitable for the Instagram business integration.
2. Enable the Instagram capabilities needed for business account identity, messaging, and publishing.
3. Register this callback URL exactly:

https://<omnibox-host>/api/omnibox/oauth/instagram/callback

4. Store these server-side environment variables:
   - OMNIBOX_INSTAGRAM_CLIENT_ID
   - OMNIBOX_INSTAGRAM_CLIENT_SECRET
   - Optional: OMNIBOX_INSTAGRAM_SCOPES
5. Default OmniBox scopes are:
   - instagram_business_basic
   - instagram_business_manage_messages
   - instagram_business_content_publish
6. Configure Meta webhook subscriptions and production review requirements needed for the live features you enable.

### Store-user connection

1. Open 接続アカウント → 新規アカウントを追加 → Instagram.
2. OmniBox redirects to the official Instagram authorization screen.
3. Sign in to or select the business account to connect.
4. Grant the requested permissions.
5. Return to OmniBox and confirm the connected account appears as active.

OAuth access / refresh data is stored server-side in Supabase Vault. Provider passwords are not stored by OmniBox.

## X

### Operator preparation

1. Create a Project / App in the X Developer Portal.
2. Enable OAuth 2.0 Authorization Code with PKCE for the app.
3. Register this callback URL exactly:

https://<omnibox-host>/api/omnibox/oauth/x/callback

4. Store:
   - OMNIBOX_X_CLIENT_ID
   - OMNIBOX_X_CLIENT_SECRET
   - Optional: OMNIBOX_X_SCOPES
5. Default OmniBox scopes are:
   - tweet.read
   - tweet.write
   - users.read
   - dm.read
   - dm.write
   - offline.access
6. Confirm that the X plan / access tier used by the developer app permits the APIs needed by OmniBox, especially Direct Messages.

### Store-user connection

1. Open 接続アカウント → 新規アカウントを追加 → X.
2. Continue to X authorization.
3. Select the account and approve the requested permissions.
4. Return to OmniBox and confirm the connected account is active.

## Google / Gmail

### Operator preparation

1. Create or select a Google Cloud project.
2. Enable the Gmail API.
3. Configure the Google OAuth consent screen.
4. Create an OAuth Client with application type Web application.
5. Register this authorized redirect URI exactly:

https://<omnibox-host>/api/omnibox/oauth/google/callback

6. Store:
   - OMNIBOX_GOOGLE_CLIENT_ID
   - OMNIBOX_GOOGLE_CLIENT_SECRET
   - Optional: OMNIBOX_GOOGLE_SCOPES
7. Default OmniBox scopes include:
   - openid
   - email
   - profile
   - gmail.readonly
   - gmail.send
8. Complete Google's verification requirements for the Gmail scopes before public production use when required.

### Store-user connection

1. Open 接続アカウント → 新規アカウントを追加 → Google / Gmail.
2. Sign in with the Gmail / Google Workspace account to connect.
3. Review the requested permissions and approve.
4. Return to OmniBox and confirm the account is active.
5. Send a test email to the connected mailbox and confirm synchronization.

## Environment variables

Configure provider credentials on the OmniBox web deployment.

Instagram:
- OMNIBOX_INSTAGRAM_CLIENT_ID
- OMNIBOX_INSTAGRAM_CLIENT_SECRET
- optional OMNIBOX_INSTAGRAM_SCOPES

X:
- OMNIBOX_X_CLIENT_ID
- OMNIBOX_X_CLIENT_SECRET
- optional OMNIBOX_X_SCOPES

Google / Gmail:
- OMNIBOX_GOOGLE_CLIENT_ID
- OMNIBOX_GOOGLE_CLIENT_SECRET
- optional OMNIBOX_GOOGLE_SCOPES

## Token storage and security

OAuth access and refresh token bundles are written to Supabase Vault. provider_connections stores connection metadata and the Vault secret reference.

LINE's Channel Secret is encrypted by the bridge before it is persisted. The bridge holds the private decryption key. The persistence Edge Function receives encrypted fields only.

Never place provider Client Secrets, LINE Channel Secrets, OAuth refresh tokens, SUPABASE_SERVICE_ROLE_KEY, master passwords, or AI credentials in browser JavaScript, Git commits, screenshots, issue comments, or support messages.

## Current connection capabilities

- LINE: live Messaging API setup, inbound webhook, webhook diagnostics / repair, profile lookup, and replies.
- Instagram: OAuth authorization, account identity lookup, secure token persistence, inbound synchronization / webhook handling where provider setup permits it, replies, and publishing support already wired in OmniBox.
- X: OAuth 2.0 Authorization Code with PKCE, identity lookup, secure token persistence, Direct Message handling and reply path subject to X access level, and publishing support.
- Google / Gmail: server-side OAuth, identity lookup, secure token persistence, inbox synchronization, and replies.

Provider app approval, production permissions / scopes, webhook subscriptions, billing, and API access tiers remain subject to each provider's developer platform.
