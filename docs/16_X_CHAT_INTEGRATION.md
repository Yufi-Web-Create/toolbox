# X Chat encrypted messaging integration (MatoMeet)

Status: design and safe UI copy staged; encrypted inbox is NOT implemented yet.
Official sources (reviewed 2026-10-13):
- https://docs.x.com/xchat/introduction
- https://docs.x.com/xchat/getting-started
- https://docs.x.com/xchat/real-time-events
- https://docs.x.com/xchat/handling-private-keys

## Current production baseline
- Existing `omnibox-x-sync` calls the **legacy** `GET /2/dm_events` endpoint and ingests plaintext.
- OAuth permissions include `dm.read`, `dm.write`, `tweet.read`, `users.read`, `offline.access`.
- X Chat encrypts content client-side; zero legacy DM events does NOT establish zero X Chat events.
- Do not silently mark X inbox as fully synchronized when legacy fetch returns 0.
- Keep X posting, its OAuth authorization and legacy DM ingestion intact.

## Security/product decision
MatoMeet is a multi-user, multi-organization SaaS. X Chat private identity/signing keys and PINs MUST NOT be collected by server APIs, pushed to Supabase/Render, emitted in logs, or stored in plaintext localStorage.
Use official `@xdevplatform/chat-xdk` WASM in a trusted browser session with secure backup `unlock` / `setup`. An OAuth token alone does not grant the ability to decrypt ciphertext. Keys should be unlocked into memory for the session and locked on logout.
Server-side background plaintext ingestion/AI suggestions/push message previews require an explicit separately designed and reviewed bot key-custody model; do not bypass X Chat E2EE without user consent.

## Implementation milestones
1. **Read-only capability and key readiness:** authenticated endpoint, scoped to `organization_members` and the actual provider connection, to fetch X Chat public-key record and conversation/event metadata. Return only nonsensitive diagnostics (API status, key registration available, need unlock); never return raw ciphertext in logs. Handle 401/403/429 with clear UI. Respect rate limits. No synthetic messages.
2. **Browser key flow:** pin exact compatible official `@xdevplatform/chat-xdk` and `@xdevplatform/xdk` releases; integrate `createChat`, existing public-key lookup, secure backup `unlock` or first-time `generateKeypairs` + public key registration + `setup`. Show explicit confirmation before registering/rotating keys. Existing X app identity/key recovery must be verified, not overwritten. Do not send PIN in network requests.
3. **Encrypted receive:** fetch `GET /2/chat/conversations/{id}/events`, process `meta.conversation_key_events`, get participant signing public keys; verify signatures and decrypt locally with Chat XDK; paginate and deduplicate by signed message ID. Keep encrypted content separate from legacy DM records until consent and retention policy are defined.
4. **Reply:** encrypt/sign via Chat XDK; POST `/2/chat/conversations/{id}/messages` only after keys and participants verified; guard duplicates and report failures.
5. **Live:** register OAuth-user authorized `chat.received` activity subscriptions. Consume webhook/stream ciphertext only; browser decrypt after unlock. Distinguish offline notification of an encrypted event from displaying decrypted message text. Verify webhook authenticity and implement replay/idempotency.
6. **Quality:** multi-tenant authorization tests, shared-device logout tests, key loss/recovery tests, 429 backoff tests, 1:1/group and key rotation, message history, no PIN in API/server telemetry, XSS/CSP review and integration tests before promoting to production.

## Required product decisions
- End-to-end encrypted read/reply in browser vs managed bot-server access. Default to browser keys to preserve E2EE boundaries.
- The encrypted inbox cannot promise automatic message text processing while the user's key is locked or browser is closed.
- Establish explicit consent and retention for decrypted messages if sharing them with the existing team inbox/database is desired.

## Acceptance criteria for calling encrypted X Chat supported
- Connected X Chat identity can be recovered/unlocked safely without server receiving PIN or keys.
- A real received encrypted test message is displayed correctly in MatoMeet and matches X.
- Sending a reply via Chat XDK appears in X.
- A different tenant cannot read the event or encryption state; no secrets in logs.
- Background notifications disclose no encrypted plaintext unless the product has separately secured consented key management.
- Existing posting + legacy DM sync still pass regression tests.
