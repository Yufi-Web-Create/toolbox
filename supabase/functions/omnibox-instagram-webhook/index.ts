import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(raw: Uint8Array, signature: string, secret: string) {
  if (!signature.startsWith("sha256=") || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, raw);
  const expected = "sha256=" + hex(digest);
  if (expected.length !== signature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

async function deriveVerifyToken(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("omnibox-instagram-webhook:" + secret),
  );
  return hex(digest).slice(0, 40);
}

function parseTokenBundle(value: unknown) {
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

async function fetchInstagramProfile(accessToken: string, userId: string) {
  try {
    const url = new URL(
      `https://graph.instagram.com/${encodeURIComponent(userId)}`,
    );
    url.searchParams.set("fields", "id,name,username,profile_pic");
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return { displayName: userId, avatarUrl: null };
    }

    const profile = await response.json();
    const username =
      typeof profile?.username === "string" ? profile.username.trim() : "";
    const name =
      typeof profile?.name === "string" ? profile.name.trim() : "";
    const avatarUrl =
      typeof profile?.profile_pic === "string" && profile.profile_pic.trim()
        ? profile.profile_pic.trim()
        : null;

    return {
      displayName: name || (username ? `@${username}` : userId),
      avatarUrl,
    };
  } catch {
    return { displayName: userId, avatarUrl: null };
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "server_not_configured" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";

    if (mode !== "subscribe" || !token) {
      return json(403, { ok: false, error: "verification_failed" });
    }

    const { data: connections } = await admin
      .from("provider_connections")
      .select("id")
      .eq("provider", "instagram")
      .eq("status", "active")
      .not("vault_secret_id", "is", null);

    for (const connection of connections ?? []) {
      const { data: secretValue } = await admin.rpc(
        "omnibox_get_provider_secret",
        { p_connection_id: connection.id },
      );
      const bundle = parseTokenBundle(secretValue);
      const clientSecret =
        bundle && typeof bundle.omnibox_client_secret === "string"
          ? bundle.omnibox_client_secret
          : "";

      if (clientSecret && token === await deriveVerifyToken(clientSecret)) {
        return new Response(challenge, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    }

    return json(403, { ok: false, error: "verification_failed" });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  if (payload.object !== "instagram" || !Array.isArray(payload.entry)) {
    return json(200, { ok: true, ignored: true });
  }

  const accountIds = [
    ...new Set(
      payload.entry
        .map((rawEntry) =>
          rawEntry && typeof rawEntry === "object"
            ? String((rawEntry as Record<string, unknown>).id ?? "").trim()
            : "",
        )
        .filter(Boolean),
    ),
  ];

  if (accountIds.length === 0) {
    return json(200, { ok: true, accepted: 0 });
  }

  const { data: matchingConnections } = await admin
    .from("provider_connections")
    .select("id, organization_id, external_account_id")
    .eq("provider", "instagram")
    .eq("status", "active")
    .in("external_account_id", accountIds);

  const connectionSecrets = new Map<
    string,
    { connectionId: string; organizationId: string; accessToken: string; clientSecret: string }
  >();

  let signatureValid = false;

  for (const connection of matchingConnections ?? []) {
    const { data: secretValue } = await admin.rpc(
      "omnibox_get_provider_secret",
      { p_connection_id: connection.id },
    );
    const bundle = parseTokenBundle(secretValue);
    const accessToken =
      bundle && typeof bundle.access_token === "string"
        ? bundle.access_token
        : "";
    const clientSecret =
      bundle && typeof bundle.omnibox_client_secret === "string"
        ? bundle.omnibox_client_secret
        : "";

    if (!clientSecret) continue;

    connectionSecrets.set(String(connection.external_account_id), {
      connectionId: connection.id,
      organizationId: connection.organization_id,
      accessToken,
      clientSecret,
    });

    if (!signatureValid) {
      signatureValid = await verifySignature(raw, signature, clientSecret);
    }
  }

  if (!signatureValid) {
    return json(401, { ok: false, error: "invalid_signature" });
  }

  let accepted = 0;

  for (const rawEntry of payload.entry) {
    const entry =
      rawEntry && typeof rawEntry === "object"
        ? (rawEntry as Record<string, unknown>)
        : null;
    if (!entry) continue;

    const accountId = String(entry.id ?? "").trim();
    const connection = connectionSecrets.get(accountId);
    if (!connection) continue;

    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const rawEvent of messaging) {
      const event =
        rawEvent && typeof rawEvent === "object"
          ? (rawEvent as Record<string, unknown>)
          : null;
      if (!event) continue;

      const message =
        event.message && typeof event.message === "object"
          ? (event.message as Record<string, unknown>)
          : null;
      const sender =
        event.sender && typeof event.sender === "object"
          ? (event.sender as Record<string, unknown>)
          : null;

      if (!message || message.is_echo === true || !sender) continue;

      const senderId = String(sender.id ?? "").trim();
      const messageId = String(message.mid ?? "").trim();
      const body =
        typeof message.text === "string" ? message.text.trim() : "";

      if (!senderId || !messageId || !body) continue;

      const profile = connection.accessToken
        ? await fetchInstagramProfile(connection.accessToken, senderId)
        : { displayName: senderId, avatarUrl: null };

      const occurredAt =
        typeof event.timestamp === "number"
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString();

      const { error: ingestError } = await admin.rpc(
        "omnibox_ingest_external_message",
        {
          p_provider_connection_id: connection.connectionId,
          p_provider: "instagram",
          p_provider_thread_id: senderId,
          p_customer_external_id: senderId,
          p_customer_display_name: profile.displayName,
          p_customer_avatar_url: profile.avatarUrl,
          p_provider_message_id:
            `instagram:${connection.connectionId}:${messageId}`,
          p_body: body,
          p_occurred_at: occurredAt,
          p_metadata: { account_id: accountId },
        },
      );

      if (!ingestError) accepted += 1;
    }
  }

  return json(200, { ok: true, accepted });
});