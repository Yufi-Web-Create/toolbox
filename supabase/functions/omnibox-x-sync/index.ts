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
        btoa(
          encodeURIComponent(clientId) +
            ":" +
            encodeURIComponent(clientSecret),
        ),
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

  let imported = 0;
  let accounts = 0;

  for (const connection of connections ?? []) {
    const { data: secretValue } = await admin.rpc(
      "omnibox_get_provider_secret",
      { p_connection_id: connection.id },
    );
    let bundle = parseBundle(secretValue);
    if (!bundle) continue;

    let xToken =
      typeof bundle.access_token === "string" ? bundle.access_token : "";

    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;

    if (!xToken || (expiresAt && expiresAt < Date.now() + 60_000)) {
      const refreshed = await refreshXToken(bundle);
      if (!refreshed) continue;

      bundle = refreshed;
      xToken = String(refreshed.access_token ?? "");

      const expiresIn =
        typeof refreshed.expires_in === "number"
          ? refreshed.expires_in
          : null;
      const nextExpiry = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      await admin.rpc("omnibox_replace_provider_secret", {
        p_connection_id: connection.id,
        p_secret_json: JSON.stringify(refreshed),
        p_token_expires_at: nextExpiry,
      });
    }

    if (!xToken) continue;

    const url = new URL("https://api.x.com/2/dm_events");
    url.searchParams.set("event_types", "MessageCreate");
    url.searchParams.set("max_results", "100");
    url.searchParams.set(
      "dm_event.fields",
      "id,text,event_type,dm_conversation_id,created_at,sender_id,participant_ids",
    );
    url.searchParams.set("expansions", "sender_id,participant_ids");
    url.searchParams.set(
      "user.fields",
      "id,name,username,profile_image_url",
    );

    const response = await fetch(url, {
      headers: { authorization: "Bearer " + xToken },
    });

    if (!response.ok) continue;

    const result = await response.json();
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

    for (const event of events) {
      if (!event || typeof event !== "object") continue;

      const eventId = String(event.id ?? "").trim();
      const senderId = String(event.sender_id ?? "").trim();
      const threadId = String(event.dm_conversation_id ?? "").trim();
      const body = typeof event.text === "string" ? event.text.trim() : "";

      if (
        !eventId ||
        !senderId ||
        !threadId ||
        !body ||
        senderId === connection.external_account_id
      ) {
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
    }
  }

  return json(200, { ok: true, accounts, imported });
});