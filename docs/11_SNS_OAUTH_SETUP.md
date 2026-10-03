# OmniBox SNS OAuth configuration

OmniBox users connect social accounts through the providers' official OAuth screens.
Customers do not enter Instagram/X/Google passwords or developer API keys into OmniBox.

## Environment variables

Configure these on the OmniBox web application deployment:

### Instagram

- `OMNIBOX_INSTAGRAM_CLIENT_ID`
- `OMNIBOX_INSTAGRAM_CLIENT_SECRET`
- Optional: `OMNIBOX_INSTAGRAM_SCOPES`

Callback:

`https://<omnibox-host>/api/omnibox/oauth/instagram/callback`

### X

- `OMNIBOX_X_CLIENT_ID`
- `OMNIBOX_X_CLIENT_SECRET`
- Optional: `OMNIBOX_X_SCOPES`

Callback:

`https://<omnibox-host>/api/omnibox/oauth/x/callback`

### Google / Gmail

- `OMNIBOX_GOOGLE_CLIENT_ID`
- `OMNIBOX_GOOGLE_CLIENT_SECRET`
- Optional: `OMNIBOX_GOOGLE_SCOPES`

Callback:

`https://<omnibox-host>/api/omnibox/oauth/google/callback`

## Token storage

OAuth access and refresh token bundles are written to Supabase Vault.
`provider_connections` stores only connection metadata and the Vault secret reference.

## Current connection capabilities

- LINE: live Messaging API configuration, webhook and replies.
- Instagram: OAuth authorization, token exchange, account identity lookup, secure token persistence.
- X: OAuth 2.0 Authorization Code with PKCE, account identity lookup, secure token persistence.
- Google / Gmail: server-side OAuth, account identity lookup, secure token persistence.

Provider app approval, production permissions/scopes, and webhook/push configuration still depend on each provider's developer console.
