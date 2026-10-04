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

function base64UrlDecode(value: string) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function findTextPart(part: Record<string, unknown>): string {
  const mimeType = String(part.mimeType ?? "");
  const body =
    part.body && typeof part.body === "object"
      ? (part.body as Record<string, unknown>)
      : {};
  const data = typeof body.data === "string" ? body.data : "";

  if (mimeType === "text/plain" && data) {
    return base64UrlDecode(data).trim();
  }

  const parts = Array.isArray(part.parts) ? part.parts : [];
  for (const child of parts) {
    if (!child || typeof child !== "object") continue;
    const text = findTextPart(child as Record<string, unknown>);
    if (text) return text;
  }

  if (mimeType === "text/html" && data) {
    return base64UrlDecode(data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function headerMap(payload: Record<string, unknown>) {
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const map = new Map<string, string>();
  for (const item of headers) {
    if (!item || typeof item !== "object") continue;
    const header = item as Record<string, unknown>;
    const name = String(header.name ?? "").toLowerCase();
    const value = String(header.value ?? "");
    if (name) map.set(name, value);
  }
  return map;
}

function parseFrom(value: string) {
  const match = value.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: (match[1] ?? "").trim() || match[2].trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  const email = value.trim().toLowerCase();
  return { name: email, email };
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
  const googleClientId = Deno.env.get("OMNIBOX_GOOGLE_CLIENT_ID") ?? "";
  const googleClientSecret =
    Deno.env.get("OMNIBOX_GOOGLE_CLIENT_SECRET") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "server_not_configured" });
  }

  const accessToken = bearer(req);
  if (!accessToken) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } =
    await admin.auth.getUser(accessToken);
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
    .select("id, external_account_id, account_name, handle, token_expires_at")
    .eq("organization_id", membership.organization_id)
    .eq("provider", "google")
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

    let gmailToken =
      typeof bundle.access_token === "string" ? bundle.access_token : "";

    const expiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0;

    if (!gmailToken || (expiresAt && expiresAt < Date.now() + 60_000)) {
      const refreshed = await refreshGoogleToken(
        bundle,
        googleClientId,
        googleClientSecret,
      );
      if (!refreshed) continue;

      bundle = refreshed;
      gmailToken = String(refreshed.access_token ?? "");
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

    if (!gmailToken) continue;

    const listUrl = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    );
    listUrl.searchParams.set("labelIds", "INBOX");
    listUrl.searchParams.set("maxResults", "25");
    listUrl.searchParams.set("q", "-from:me");

    const listResponse = await fetch(listUrl, {
      headers: { authorization: `Bearer ${gmailToken}` },
    });

    if (!listResponse.ok) continue;
    const list = await listResponse.json();
    const messages = Array.isArray(list.messages) ? list.messages : [];
    accounts += 1;

    for (const item of messages) {
      const messageId = String(item?.id ?? "");
      if (!messageId) continue;

      const messageUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
      );
      messageUrl.searchParams.set("format", "full");

      const messageResponse = await fetch(messageUrl, {
        headers: { authorization: `Bearer ${gmailToken}` },
      });
      if (!messageResponse.ok) continue;

      const message = await messageResponse.json();
      const payload =
        message.payload && typeof message.payload === "object"
          ? (message.payload as Record<string, unknown>)
          : {};
      const headers = headerMap(payload);
      const from = parseFrom(headers.get("from") ?? "");
      const subject = headers.get("subject")?.trim() ?? "";
      const body =
        findTextPart(payload) ||
        (typeof message.snippet === "string" ? message.snippet.trim() : "");
      const text = [subject ? `件名: ${subject}` : "", body]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (!from.email || !text) continue;

      const threadId = String(message.threadId ?? messageId);
      const internalDate = Number(message.internalDate);
      const occurredAt = Number.isFinite(internalDate)
        ? new Date(internalDate).toISOString()
        : new Date().toISOString();

      const { error: ingestError } = await admin.rpc(
        "omnibox_ingest_external_message",
        {
          p_provider_connection_id: connection.id,
          p_provider: "email",
          p_provider_thread_id: threadId,
          p_customer_external_id: from.email,
          p_customer_display_name: from.name,
          p_customer_avatar_url: null,
          p_provider_message_id: `google:${connection.id}:${messageId}`,
          p_body: text,
          p_occurred_at: occurredAt,
          p_metadata: {
            subject,
            gmail_message_id: messageId,
            gmail_thread_id: threadId,
            rfc822_message_id: headers.get("message-id") ?? "",
          },
        },
      );

      if (!ingestError) imported += 1;
    }
  }

  return json(200, { ok: true, accounts, imported });
});