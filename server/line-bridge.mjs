import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 5000;
const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "OMNIBOX_ORGANIZATION_ID",
  "BRIDGE_SIGNING_PRIVATE_KEY_PEM",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function safeStringEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
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
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
    organizationId: env.OMNIBOX_ORGANIZATION_ID?.trim() ?? "",
    signingPrivateKey: env.BRIDGE_SIGNING_PRIVATE_KEY_PEM ?? "",
    lineChannelSecret: env.LINE_CHANNEL_SECRET?.trim() ?? "",
    lineAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "",
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
  if (rawBody.length === 0) throw new Error("empty body");
  return JSON.parse(rawBody.toString("utf8"));
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function postSignedPersistence(fetchImpl, config, payload) {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signer = createSign("RSA-SHA256");
  signer.update(`${timestamp}.${body}`);
  signer.end();
  const signature = signer.sign(config.signingPrivateKey, "base64");

  const response = await fetchImpl(
    `${config.supabaseUrl}/functions/v1/omnibox-line-persist`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-omnibox-timestamp": timestamp,
        "x-omnibox-signature": signature,
      },
      body,
    },
  );

  if (!response.ok) {
    throw new Error("persistence failed");
  }

  return await response.json();
}

async function fetchLineProfile(fetchImpl, config, userId) {
  try {
    const response = await fetchImpl(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${config.lineAccessToken}` } },
    );

    if (!response.ok) return "LINE user";
    const profile = await response.json();
    return typeof profile?.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim()
      : "LINE user";
  } catch {
    return "LINE user";
  }
}

async function fetchAuthenticatedUser(fetchImpl, config, accessToken) {
  const response = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json();
  return isUuid(user?.id) ? user : null;
}

async function fetchVisibleConversation(fetchImpl, config, accessToken, conversationId) {
  const url = new URL("/rest/v1/conversations", config.supabaseUrl);
  url.searchParams.set("select", "id,organization_id,customer_external_id");
  url.searchParams.set("id", `eq.${conversationId}`);
  url.searchParams.set("organization_id", `eq.${config.organizationId}`);
  url.searchParams.set("limit", "1");

  const response = await fetchImpl(url, {
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function handleLineWebhook({ request, response, config, fetchImpl }) {
  if (!config.configured) {
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
    if (!normalized) continue;

    const customerDisplayName = await fetchLineProfile(
      fetchImpl,
      config,
      normalized.customerExternalId,
    );

    await postSignedPersistence(fetchImpl, config, {
      action: "inbound",
      organizationId: config.organizationId,
      ...normalized,
      customerDisplayName,
    });
  }

  sendJson(response, 200, { ok: true });
}

async function handleLineReply({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const user = await fetchAuthenticatedUser(fetchImpl, config, accessToken);
  if (!user) {
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
    typeof payload?.conversationId === "string" ? payload.conversationId.trim() : "";
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!isUuid(conversationId) || !message || message.length > MAX_TEXT_LENGTH) {
    sendJson(response, 400, { ok: false, error: "invalid_request" });
    return;
  }

  const conversation = await fetchVisibleConversation(
    fetchImpl,
    config,
    accessToken,
    conversationId,
  );

  if (!conversation) {
    sendJson(response, 404, { ok: false, error: "conversation_not_found" });
    return;
  }

  const lineResponse = await fetchImpl("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.lineAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: conversation.customer_external_id,
      messages: [{ type: "text", text: message }],
    }),
  });

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

  await postSignedPersistence(fetchImpl, config, {
    action: "outbound",
    organizationId: config.organizationId,
    conversationId,
    body: message,
    providerMessageId,
    sentByUserId: user.id,
    createdAt: new Date().toISOString(),
  });

  sendJson(response, 200, { ok: true });
}

export function createLineBridgeServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = getBridgeConfiguration(env);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          configured: config.configured,
          missing: config.missing,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/webhooks/line") {
        await handleLineWebhook({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/line/reply") {
        await handleLineReply({ request, response, config, fetchImpl });
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLineBridge();
}
