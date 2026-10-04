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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64UrlUtf8(value: string) {
  return bytesToBase64(new TextEncoder().encode(value))
    .split("+").join("-")
    .split("/").join("_")
    .split("=").join("");
}

function mimeHeader(value: string) {
  const ascii = Array.from(value).every((char) => char.charCodeAt(0) <= 127);
  return ascii
    ? value
    : "=?UTF-8?B?" +
        bytesToBase64(new TextEncoder().encode(value)) +
        "?=";
}

async function refreshGoogleToken(
  bundle: Record<string, unknown>,
  clientId: string,
  clientSecret: string,
) {
  const refreshToken =
    typeof bundle.refresh_token === "string" ? bundle.refresh_token : "";
  if (!refreshToken || !clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return null;

  const refreshed = await response.json();
  if (typeof refreshed?.access_token !== "string") return null;

  return {
    ...bundle,
    ...refreshed,
    refresh_token: refreshToken,
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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const conversationId =
    typeof payload.conversationId === "string"
      ? payload.conversationId.trim()
      : "";
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";

  if (!conversationId || !message || message.length > 5000) {
    return json(400, { ok: false, error: "invalid_request" });
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

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .select(
      "id, organization_id, provider, provider_connection_id, provider_thread_id, customer_external_id, provider_metadata",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return json(404, { ok: false, error: "conversation_not_found" });
  }

  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", conversation.organization_id)
    .maybeSingle();

  if (!membership) {
    return json(403, { ok: false, error: "forbidden" });
  }

  if (!conversation.provider_connection_id) {
    return json(409, { ok: false, error: "provider_connection_missing" });
  }

  const { data: connection, error: connectionError } = await admin
    .from("provider_connections")
    .select(
      "id, provider, external_account_id, token_expires_at, status",
    )
    .eq("id", conversation.provider_connection_id)
    .eq("organization_id", conversation.organization_id)
    .maybeSingle();

  if (
    connectionError ||
    !connection ||
    connection.status !== "active"
  ) {
    return json(409, { ok: false, error: "provider_connection_unavailable" });
  }

  const { data: secretValue } = await admin.rpc(
    "omnibox_get_provider_secret",
    { p_connection_id: connection.id },
  );
  let bundle = parseBundle(secretValue);
  if (!bundle) {
    return json(409, { ok: false, error: "provider_token_missing" });
  }

  let accessToken =
    typeof bundle.access_token === "string" ? bundle.access_token : "";

  if (conversation.provider === "email") {
    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;

    if (!accessToken || (expiresAt && expiresAt < Date.now() + 60_000)) {
      const refreshed = await refreshGoogleToken(
        bundle,
        typeof bundle.omnibox_client_id === "string"
          ? bundle.omnibox_client_id
          : Deno.env.get("OMNIBOX_GOOGLE_CLIENT_ID") ?? "",
        typeof bundle.omnibox_client_secret === "string"
          ? bundle.omnibox_client_secret
          : Deno.env.get("OMNIBOX_GOOGLE_CLIENT_SECRET") ?? "",
      );

      if (!refreshed) {
        return json(409, { ok: false, error: "google_token_refresh_failed" });
      }

      bundle = refreshed;
      accessToken = String(refreshed.access_token ?? "");

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

    const metadata =
      conversation.provider_metadata &&
      typeof conversation.provider_metadata === "object"
        ? conversation.provider_metadata as Record<string, unknown>
        : {};

    const originalSubject =
      typeof metadata.subject === "string" && metadata.subject.trim()
        ? metadata.subject.trim()
        : "お問い合わせ";
    const subject = originalSubject.toLowerCase().startsWith("re:")
      ? originalSubject
      : "Re: " + originalSubject;
    const rfc822Id =
      typeof metadata.rfc822_message_id === "string"
        ? metadata.rfc822_message_id.trim()
        : "";

    const headers = [
      "To: " + conversation.customer_external_id,
      "Subject: " + mimeHeader(subject),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      ...(rfc822Id
        ? ["In-Reply-To: " + rfc822Id, "References: " + rfc822Id]
        : []),
    ];

    const raw = base64UrlUtf8(
      headers.join("\r\n") + "\r\n\r\n" + message,
    );

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + accessToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          raw,
          threadId: conversation.provider_thread_id,
        }),
      },
    );

    if (!response.ok) {
      return json(502, { ok: false, error: "gmail_send_failed" });
    }

    const sent = await response.json();
    const providerMessageId =
      typeof sent?.id === "string" && sent.id
        ? "google:" + connection.id + ":" + sent.id
        : "google:" + connection.id + ":out:" + crypto.randomUUID();

    await admin.rpc("omnibox_record_external_outbound", {
      p_conversation_id: conversation.id,
      p_provider_message_id: providerMessageId,
      p_body: message,
      p_sent_by_user_id: user.id,
    });

    return json(200, { ok: true, provider: "email" });
  }

  if (conversation.provider === "instagram") {
    if (!accessToken || !connection.external_account_id) {
      return json(409, { ok: false, error: "instagram_token_missing" });
    }

    const apiVersion =
      Deno.env.get("OMNIBOX_INSTAGRAM_API_VERSION")?.trim() || "v26.0";
    const endpoint =
      "https://graph.instagram.com/" +
      apiVersion +
      "/" +
      encodeURIComponent(connection.external_account_id) +
      "/messages";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer " + accessToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: conversation.customer_external_id },
        message: { text: message },
      }),
    });

    if (!response.ok) {
      return json(502, { ok: false, error: "instagram_send_failed" });
    }

    const sent = await response.json();
    const providerMessageId =
      typeof sent?.message_id === "string" && sent.message_id
        ? "instagram:" + connection.id + ":" + sent.message_id
        : "instagram:" + connection.id + ":out:" + crypto.randomUUID();

    await admin.rpc("omnibox_record_external_outbound", {
      p_conversation_id: conversation.id,
      p_provider_message_id: providerMessageId,
      p_body: message,
      p_sent_by_user_id: user.id,
    });

    return json(200, { ok: true, provider: "instagram" });
  }

  return json(501, { ok: false, error: "provider_reply_not_supported" });
});