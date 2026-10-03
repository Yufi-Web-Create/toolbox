import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 5000;
const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "OMNIBOX_ORGANIZATION_ID",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_BRIDGE_INTERNAL_KEY",
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function safeStringEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyLineSignature(rawBody, signature, channelSecret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !signature ||
    typeof channelSecret !== "string" ||
    !channelSecret
  ) {
    return false;
  }

  const expected = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  return safeStringEqual(expected, signature);
}

export function normalizeLineTextEvent(event) {
  if (
    !event ||
    event.type !== "message" ||
    event.message?.type !== "text" ||
    typeof event.message?.id !== "string" ||
    typeof event.message?.text !== "string" ||
    !event.message.text.trim() ||
    event.source?.type !== "user" ||
    typeof event.source?.userId !== "string" ||
    !event.source.userId
  ) {
    return null;
  }

  const occurredAt =
    typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
      ? new Date(event.timestamp).toISOString()
      : new Date().toISOString();

  return {
    customerExternalId: event.source.userId,
    providerThreadId: `line:user:${event.source.userId}`,
    providerMessageId: event.message.id,
    body: event.message.text,
    occurredAt,
  };
}

export function getBridgeConfiguration(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());

  return {
    configured: missing.length === 0,
    missing,
    supabaseUrl: env.SUPABASE_URL?.trim() ?? "",
    supabaseSecretKey: env.SUPABASE_SECRET_KEY?.trim() ?? "",
    organizationId: env.OMNIBOX_ORGANIZATION_ID?.trim() ?? "",
    lineChannelSecret: env.LINE_CHANNEL_SECRET?.trim() ?? "",
    lineAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "",
    internalKey: env.LINE_BRIDGE_INTERNAL_KEY?.trim() ?? "",
    port: Number.parseInt(env.PORT ?? "8787", 10) || 8787,
  };
}

async function readRawBody(request) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);

  if (rawBody.length === 0) {
    throw new Error("empty body");
  }

  return JSON.parse(rawBody.toString("utf8"));
}

function createSupabaseAdmin(config) {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function fetchLineProfile(fetchImpl, config, userId) {
  try {
    const response = await fetchImpl(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${config.lineAccessToken}`,
        },
      },
    );

    if (!response.ok) {
      return "LINE user";
    }

    const profile = await response.json();
    return typeof profile?.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim()
      : "LINE user";
  } catch {
    return "LINE user";
  }
}

async function persistInboundEvent({
  supabase,
  config,
  normalized,
  customerDisplayName,
}) {
  const conversationPayload = {
    organization_id: config.organizationId,
    provider: "line",
    provider_thread_id: normalized.providerThreadId,
    customer_external_id: normalized.customerExternalId,
    customer_display_name: customerDisplayName,
    status: "unread",
    last_message_preview: normalized.body.slice(0, 500),
    last_message_at: normalized.occurredAt,
    updated_at: normalized.occurredAt,
  };

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .upsert(conversationPayload, {
      onConflict: "organization_id,provider,provider_thread_id",
    })
    .select("id")
    .single();

  if (conversationError || !conversation?.id) {
    throw new Error("conversation persistence failed");
  }

  const { error: messageError } = await supabase.from("messages").upsert(
    {
      organization_id: config.organizationId,
      conversation_id: conversation.id,
      provider_message_id: normalized.providerMessageId,
      direction: "inbound",
      body: normalized.body,
      sent_by_user_id: null,
      created_at: normalized.occurredAt,
    },
    {
      onConflict: "organization_id,provider_message_id",
      ignoreDuplicates: true,
    },
  );

  if (messageError) {
    throw new Error("message persistence failed");
  }
}

async function handleLineWebhook({
  request,
  response,
  config,
  supabase,
  fetchImpl,
}) {
  if (!config.configured || !supabase) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const rawBody = await readRawBody(request);
  const signature = request.headers["x-line-signature"];

  if (
    !verifyLineSignature(
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
      config.lineChannelSecret,
    )
  ) {
    sendJson(response, 401, { ok: false, error: "invalid_signature" });
    return;
  }

  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];

  for (const event of events) {
    const normalized = normalizeLineTextEvent(event);

    if (!normalized) {
      continue;
    }

    const customerDisplayName = await fetchLineProfile(
      fetchImpl,
      config,
      normalized.customerExternalId,
    );

    await persistInboundEvent({
      supabase,
      config,
      normalized,
      customerDisplayName,
    });
  }

  sendJson(response, 200, { ok: true });
}

function getBearerToken(request) {
  const authorization = request.headers.authorization;

  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length);
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function handleLineReply({
  request,
  response,
  config,
  supabase,
  fetchImpl,
}) {
  if (!config.configured || !supabase) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  if (!safeStringEqual(getBearerToken(request), config.internalKey)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const conversationId =
    typeof payload?.conversationId === "string"
      ? payload.conversationId.trim()
      : "";
  const message =
    typeof payload?.message === "string" ? payload.message.trim() : "";
  const sentByUserId =
    typeof payload?.sentByUserId === "string" ? payload.sentByUserId.trim() : "";

  if (
    !isUuid(conversationId) ||
    !message ||
    message.length > MAX_TEXT_LENGTH ||
    !isUuid(sentByUserId)
  ) {
    sendJson(response, 400, { ok: false, error: "invalid_request" });
    return;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, organization_id, customer_external_id")
    .eq("id", conversationId)
    .eq("organization_id", config.organizationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    sendJson(response, 404, { ok: false, error: "conversation_not_found" });
    return;
  }

  const lineResponse = await fetchImpl(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.lineAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: conversation.customer_external_id,
        messages: [{ type: "text", text: message }],
      }),
    },
  );

  if (!lineResponse.ok) {
    sendJson(response, 502, { ok: false, error: "line_send_failed" });
    return;
  }

  let providerMessageId = null;

  try {
    const lineResult = await lineResponse.json();
    providerMessageId =
      typeof lineResult?.sentMessages?.[0]?.id === "string"
        ? lineResult.sentMessages[0].id
        : null;
  } catch {
    providerMessageId = null;
  }

  const createdAt = new Date().toISOString();
  const { error: messageError } = await supabase.from("messages").insert({
    organization_id: config.organizationId,
    conversation_id: conversation.id,
    provider_message_id: providerMessageId,
    direction: "outbound",
    body: message,
    sent_by_user_id: sentByUserId,
    created_at: createdAt,
  });

  if (messageError) {
    sendJson(response, 500, { ok: false, error: "message_persistence_failed" });
    return;
  }

  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      status: "in_progress",
      last_message_preview: message.slice(0, 500),
      last_message_at: createdAt,
      updated_at: createdAt,
    })
    .eq("id", conversation.id)
    .eq("organization_id", config.organizationId);

  if (updateError) {
    sendJson(response, 500, { ok: false, error: "conversation_update_failed" });
    return;
  }

  sendJson(response, 200, { ok: true });
}

export function createLineBridgeServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = getBridgeConfiguration(env);
  const supabase =
    config.supabaseUrl && config.supabaseSecretKey
      ? createSupabaseAdmin(config)
      : null;

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          configured: config.configured,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/webhooks/line") {
        await handleLineWebhook({
          request,
          response,
          config,
          supabase,
          fetchImpl,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/line/reply") {
        await handleLineReply({
          request,
          response,
          config,
          supabase,
          fetchImpl,
        });
        return;
      }

      sendJson(response, 404, { ok: false, error: "not_found" });
    } catch {
      console.error("LINE bridge request failed");
      if (!response.headersSent) {
        sendJson(response, 500, { ok: false, error: "internal_error" });
      } else {
        response.end();
      }
    }
  });
}

export function startLineBridge(options = {}) {
  const env = options.env ?? process.env;
  const server = createLineBridgeServer(options);
  const port = getBridgeConfiguration(env).port;

  server.listen(port, () => {
    console.log(`LINE bridge listening on port ${port}`);
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startLineBridge();
}
