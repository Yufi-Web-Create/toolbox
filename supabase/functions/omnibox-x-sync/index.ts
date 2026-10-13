import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function parseBundle(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function refreshXToken(bundle: Record<string, unknown>) {
  const refreshToken =
    typeof bundle.refresh_token === "string" ? bundle.refresh_token : "";
  const clientId =
    typeof bundle.omnibox_client_id === "string"
      ? bundle.omnibox_client_id
      : "";
  const clientSecret =
    typeof bundle.omnibox_client_secret === "string"
      ? bundle.omnibox_client_secret
      : "";

  if (!refreshToken || !clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization:
        "Basic " +
        btoa(clientId + ":" + clientSecret),
    },
    body,
  });

  if (!response.ok) return null;
  const refreshed = await response.json();
  if (typeof refreshed?.access_token !== "string") return null;

  return {
    ...bundle,
    ...refreshed,
    refresh_token:
      typeof refreshed.refresh_token === "string"
        ? refreshed.refresh_token
        : refreshToken,
  } as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "server_not_configured" });
  }

  const userToken = bearer(req);
  if (!userToken) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } =
    await admin.auth.getUser(userToken);
  const user = !authError ? authData.user : null;
  if (!user) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.organization_id) {
    return json(403, { ok: false, error: "membership_required" });
  }

  const { data: connections, error: connectionError } = await admin
    .from("provider_connections")
    .select("id, external_account_id, token_expires_at")
    .eq("organization_id", membership.organization_id)
    .eq("provider", "x")
    .eq("status", "active");

  if (connectionError) {
    return json(500, { ok: false, error: "connections_unavailable" });
  }

  // Explicit, read-only X Chat metadata check. Never fetch or store ciphertext or private keys.
  const requestBody = await req.json().catch(() => ({}));
  const chatStatusMode = requestBody?.mode === "chat_status";
  const chatKeyStatusMode = requestBody?.mode === "chat_key_status";
  let chatConversations = 0;
  let chatHasMore = false;
  let chatAccountsChecked = 0;
  let chatKeysRegistered = 0;
  let chatKeysMissing = 0;
  let imported = 0;
  let accounts = 0;
  let receivedEvents = 0;
  let apiReportedEvents = 0;
  let emptyWithPagination = 0;
  let skippedOwn = 0;
  let skippedEmptyText = 0;
  let skippedMalformed = 0;
  const failures: Array<{ code: string; upstream_status?: number }> = [];
  function fail(code: string, upstreamStatus?: number) {
    const failure = { code, ...(upstreamStatus ? { upstream_status: upstreamStatus } : {}) };
    failures.push(failure);
    // Never log tokens, X response bodies, message contents, or account identifiers.
    console.error("omnibox-x-sync failure", JSON.stringify(failure));
  }

  for (const connection of connections ?? []) {
    const { data: secretValue } = await admin.rpc(
      "omnibox_get_provider_secret",
      { p_connection_id: connection.id },
    );
    let bundle = parseBundle(secretValue);
    if (!bundle) { fail("x_credentials_unavailable"); continue; }

    let xToken =
      typeof bundle.access_token === "string" ? bundle.access_token : "";

    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;

    try {
      if (!xToken || (expiresAt && expiresAt < Date.now() + 60_000)) {
        const refreshed = await refreshXToken(bundle);
        if (!refreshed) { fail("x_reconnect_required"); continue; }

        bundle = refreshed;
        xToken = String(refreshed.access_token ?? "");

        const expiresIn =
          typeof refreshed.expires_in === "number"
            ? refreshed.expires_in
            : null;
        const nextExpiry = expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null;

        const { error: saveError } = await admin.rpc("omnibox_replace_provider_secret", {
          p_connection_id: connection.id,
          p_secret_json: JSON.stringify(refreshed),
          p_token_expires_at: nextExpiry,
        });
        if (saveError) { fail("x_token_save_failed"); continue; }
      }

      if (!xToken) { fail("x_reconnect_required"); continue; }

      if (chatKeyStatusMode) {
        // Public-key record metadata only; no keys, PINs, or ciphertext leave the server.
        const accountId = String(connection.external_account_id ?? "");
        if (!/^\\d{1,24}$/.test(accountId)) {
          fail("xchat_account_unavailable");
          continue;
        }
        const keyUrl = new URL("https://api.x.com/2/users/" + accountId + "/public_keys");
        keyUrl.searchParams.set("public_key.fields", "public_key_version");
        const keyResponse = await fetch(keyUrl, { headers: { authorization: "Bearer " + xToken } });
        if (!keyResponse.ok) {
          fail(keyResponse.status === 429 ? "x_rate_limited" :
            keyResponse.status === 401 ? "x_reconnect_required" :
            keyResponse.status === 403 ? "xchat_access_denied" :
            keyResponse.status === 404 ? "xchat_key_record_unavailable" : "xchat_api_error", keyResponse.status);
          continue;
        }
        const keyResult = await keyResponse.json();
        const records = Array.isArray(keyResult.data) ? keyResult.data :
          keyResult.data && typeof keyResult.data === "object" ? [keyResult.data] : [];
        if (records.length > 0) chatKeysRegistered += 1;
        else chatKeysMissing += 1;
        chatAccountsChecked += 1;
        continue;
      }

      if (chatStatusMode) {
        const chatResponse = await fetch("https://api.x.com/2/chat/conversations?max_results=10", {
          headers: { authorization: "Bearer " + xToken },
        });
        if (!chatResponse.ok) {
          fail(
            chatResponse.status === 429 ? "x_rate_limited" :
            chatResponse.status === 401 ? "x_reconnect_required" :
            chatResponse.status === 403 ? "xchat_access_denied" :
            chatResponse.status === 402 ? "x_credits_depleted" : "xchat_api_error",
            chatResponse.status,
          );
          continue;
        }
        const chatResult = await chatResponse.json();
        chatConversations += Array.isArray(chatResult.data) ? chatResult.data.length : 0;
        chatHasMore ||= Boolean(chatResult.meta?.has_more || chatResult.meta?.next_token);
        chatAccountsChecked += 1;
        continue;
      }

      const url = new URL("https://api.x.com/2/dm_events");
      url.searchParams.set("event_types", "MessageCreate");
      url.searchParams.set("max_results", "100");
      url.searchParams.set(
        "dm_event.fields",
        "id,text,event_type,dm_conversation_id,created_at",
      );
      url.searchParams.set("expansions", "sender_id,participant_ids");
      url.searchParams.set(
        "user.fields",
        "id,name,username,profile_image_url",
      );

      const response = await fetch(url, {
        headers: { authorization: "Bearer " + xToken },
      });

      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        const creditProblem = typeof problem?.type === "string" &&
          problem.type.endsWith("/credits-depleted");
        fail(creditProblem || response.status === 402 ? "x_credits_depleted" :
          response.status === 401 ? "x_reconnect_required" :
          response.status === 403 ? "x_access_denied" :
          response.status === 429 ? "x_rate_limited" : "x_api_error", response.status);
        continue;
      }

      const result = await response.json();
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        fail("x_api_partial_error", response.status);
      }
      const events = Array.isArray(result.data) ? result.data : [];
      const users = Array.isArray(result.includes?.users)
        ? result.includes.users
        : [];
      const profiles = new Map(
        users
          .filter((item: unknown) => item && typeof item === "object")
          .map((item: Record<string, unknown>) => [String(item.id ?? ""), item]),
      );

      accounts += 1;

      receivedEvents += events.length;
      apiReportedEvents += typeof result.meta?.result_count === "number" ? result.meta.result_count : 0;
      if (events.length === 0 && typeof result.meta?.next_token === "string") emptyWithPagination += 1;
      for (const event of events) {
        if (!event || typeof event !== "object") continue;

        const eventId = String(event.id ?? "").trim();
        const senderId = String(event.sender_id ?? "").trim();
        const threadId = String(event.dm_conversation_id ?? "").trim();
        const body = typeof event.text === "string" ? event.text.trim() : "";

        if (!eventId || !senderId || !threadId) {
          skippedMalformed += 1;
          continue;
        }
        if (senderId === connection.external_account_id) {
          skippedOwn += 1;
          continue;
        }
        if (!body) {
          skippedEmptyText += 1;
          continue;
        }

        const profile = profiles.get(senderId) ?? {};
        const name =
          typeof profile.name === "string" && profile.name.trim()
            ? profile.name.trim()
            : typeof profile.username === "string" &&
                profile.username.trim()
              ? "@" + profile.username.trim()
              : senderId;
        const avatar =
          typeof profile.profile_image_url === "string"
            ? profile.profile_image_url
            : null;

        const occurredAt =
          typeof event.created_at === "string" && event.created_at
            ? event.created_at
            : new Date().toISOString();

        const { error: ingestError } = await admin.rpc(
          "omnibox_ingest_external_message",
          {
            p_provider_connection_id: connection.id,
            p_provider: "x",
            p_provider_thread_id: threadId,
            p_customer_external_id: senderId,
            p_customer_display_name: name,
            p_customer_avatar_url: avatar,
            p_provider_message_id:
              "x:" + connection.id + ":" + eventId,
            p_body: body,
            p_occurred_at: occurredAt,
            p_metadata: {
              participant_ids: Array.isArray(event.participant_ids)
                ? event.participant_ids
                : [],
            },
          },
        );

        if (!ingestError) imported += 1;
        else fail("x_message_save_failed");
      }
    } catch {
      fail("x_sync_unavailable");
    }
  }

  if (chatKeyStatusMode) {
    const keySummary = { accounts_checked: chatAccountsChecked, registered: chatKeysRegistered, unregistered: chatKeysMissing };
    console.info("omnibox-x-chat-key-status", JSON.stringify(keySummary));
    if (failures.length) return json(502, { ok: false, error: failures[0].code, ...keySummary });
    return json(200, { ok: true, mode: "chat_key_status", ...keySummary });
  }
  if (chatStatusMode) {
    // No ciphertext, conversation IDs, private keys or message bodies in response or logs.
    const chatSummary = { accounts_checked: chatAccountsChecked, conversations_on_first_pages: chatConversations, has_more: chatHasMore };
    console.info("omnibox-x-chat-status", JSON.stringify(chatSummary));
    if (failures.length) return json(502, { ok: false, error: failures[0].code, ...chatSummary });
    return json(200, { ok: true, mode: "chat_status", ...chatSummary });
  }

  const diagnostics = { accounts, received_events: receivedEvents, api_reported_events: apiReportedEvents, empty_with_pagination: emptyWithPagination, imported, skipped_own: skippedOwn, skipped_empty_text: skippedEmptyText, skipped_malformed: skippedMalformed };
  // Counts only. Never log customer identifiers, DM contents, or OAuth credentials.
  console.info("omnibox-x-sync summary", JSON.stringify(diagnostics));
  if (failures.length) {
    return json(502, { ok: false, error: failures[0].code, ...diagnostics, failures });
  }

  return json(200, { ok: true, ...diagnostics });
});
