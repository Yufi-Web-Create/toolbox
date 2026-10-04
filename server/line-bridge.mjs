import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  createSign,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 5000;
const WEBHOOK_URL = "https://omnibox-line-bridge.onrender.com/webhooks/line";
const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "OMNIBOX_ORGANIZATION_ID",
  "BRIDGE_SIGNING_PRIVATE_KEY_PEM",
];

let cachedProviderConfig = null;
let cachedProviderConfigUntil = 0;
let cachedLineToken = null;
let cachedLineTokenUntil = 0;

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

export function normalizeLineMessageEvent(event) {
  if (
    !event ||
    event.type !== "message" ||
    typeof event.message?.id !== "string" ||
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

  if (
    event.message.type === "text" &&
    typeof event.message.text === "string" &&
    event.message.text.trim()
  ) {
    return {
      customerExternalId: event.source.userId,
      providerThreadId: `line:user:${event.source.userId}`,
      providerMessageId: event.message.id,
      body: event.message.text,
      messageType: "text",
      metadata: {},
      occurredAt,
    };
  }

  if (
    event.message.type === "sticker" &&
    typeof event.message.stickerId === "string" &&
    event.message.stickerId
  ) {
    return {
      customerExternalId: event.source.userId,
      providerThreadId: `line:user:${event.source.userId}`,
      providerMessageId: event.message.id,
      body: "LINEスタンプ",
      messageType: "sticker",
      metadata: {
        packageId:
          typeof event.message.packageId === "string"
            ? event.message.packageId
            : null,
        stickerId: event.message.stickerId,
        stickerResourceType:
          typeof event.message.stickerResourceType === "string"
            ? event.message.stickerResourceType
            : null,
        keywords: Array.isArray(event.message.keywords)
          ? event.message.keywords.filter((value) => typeof value === "string")
          : [],
        text:
          typeof event.message.text === "string"
            ? event.message.text
            : null,
      },
      occurredAt,
    };
  }

  return null;
}

export function normalizeLineTextEvent(event) {
  const normalized = normalizeLineMessageEvent(event);
  return normalized?.messageType === "text" ? normalized : null;
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

async function signedEdgeRequest(fetchImpl, config, payload) {
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

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
}

function encryptProviderConfig(config, providerConfig) {
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const encryptedPayload = Buffer.concat([
    cipher.update(JSON.stringify(providerConfig), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const publicKey = createPublicKey(config.signingPrivateKey);
  const encryptedKey = publicEncrypt(
    { key: publicKey, oaepHash: "sha256" },
    aesKey,
  );

  return {
    encryptedKey: encryptedKey.toString("base64"),
    encryptedPayload: encryptedPayload.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptProviderConfig(config, encrypted) {
  const aesKey = privateDecrypt(
    { key: config.signingPrivateKey, oaepHash: "sha256" },
    Buffer.from(encrypted.encrypted_key, "base64"),
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    aesKey,
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.encrypted_payload, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

async function storeProviderConfig(fetchImpl, config, providerConfig) {
  const encrypted = encryptProviderConfig(config, providerConfig);
  const { response } = await signedEdgeRequest(fetchImpl, config, {
    action: "store-config",
    organizationId: config.organizationId,
    ...encrypted,
  });

  if (!response.ok) throw new Error("config store failed");

  cachedProviderConfig = providerConfig;
  cachedProviderConfigUntil = Date.now() + 5 * 60 * 1000;
  cachedLineToken = null;
  cachedLineTokenUntil = 0;
}

async function loadProviderConfig(fetchImpl, config, force = false) {
  if (!force && cachedProviderConfig && Date.now() < cachedProviderConfigUntil) {
    return cachedProviderConfig;
  }

  const { response, data } = await signedEdgeRequest(fetchImpl, config, {
    action: "get-config",
    organizationId: config.organizationId,
  });

  if (response.status === 404) return null;
  if (!response.ok || !data?.config) throw new Error("config lookup failed");

  const providerConfig = decryptProviderConfig(config, data.config);
  cachedProviderConfig = providerConfig;
  cachedProviderConfigUntil = Date.now() + 5 * 60 * 1000;
  return providerConfig;
}

async function issueStatelessLineToken(fetchImpl, providerConfig) {
  if (cachedLineToken && Date.now() < cachedLineTokenUntil) {
    return cachedLineToken;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: providerConfig.channelId,
    client_secret: providerConfig.channelSecret,
  });

  const response = await fetchImpl("https://api.line.me/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) throw new Error("line token issue failed");
  const result = await response.json();

  if (typeof result?.access_token !== "string" || !result.access_token) {
    throw new Error("line token missing");
  }

  const expiresIn =
    typeof result.expires_in === "number" ? result.expires_in : 900;
  cachedLineToken = result.access_token;
  cachedLineTokenUntil = Date.now() + Math.max(60, expiresIn - 60) * 1000;
  return cachedLineToken;
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

async function fetchVisibleOrganization(fetchImpl, config, accessToken) {
  const url = new URL("/rest/v1/organizations", config.supabaseUrl);
  url.searchParams.set("select", "id");
  url.searchParams.set("id", `eq.${config.organizationId}`);
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

async function fetchLineProfile(fetchImpl, accessToken, userId) {
  try {
    const response = await fetchImpl(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      return { displayName: "LINE user", pictureUrl: null };
    }

    const profile = await response.json();
    return {
      displayName:
        typeof profile?.displayName === "string" && profile.displayName.trim()
          ? profile.displayName.trim()
          : "LINE user",
      pictureUrl:
        typeof profile?.pictureUrl === "string" && profile.pictureUrl.trim()
          ? profile.pictureUrl.trim()
          : null,
    };
  } catch {
    return { displayName: "LINE user", pictureUrl: null };
  }
}

async function handleHealth({ response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 200, {
      ok: true,
      configured: false,
      lineConnected: false,
      missing: config.missing,
    });
    return;
  }

  let lineConnected = false;
  try {
    lineConnected = Boolean(await loadProviderConfig(fetchImpl, config));
  } catch {
    lineConnected = false;
  }

  sendJson(response, 200, {
    ok: true,
    configured: true,
    lineConnected,
    missing: [],
  });
}

async function handleLineConfigure({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const userAccessToken = getBearerToken(request);
  if (!userAccessToken) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const user = await fetchAuthenticatedUser(fetchImpl, config, userAccessToken);
  const organization = user
    ? await fetchVisibleOrganization(fetchImpl, config, userAccessToken)
    : null;

  if (!user || !organization) {
    sendJson(response, 403, { ok: false, error: "forbidden" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const channelId =
    typeof payload?.channelId === "string" ? payload.channelId.trim() : "";
  const channelSecret =
    typeof payload?.channelSecret === "string" ? payload.channelSecret.trim() : "";

  if (!/^\d+$/.test(channelId) || channelSecret.length < 16 || channelSecret.length > 256) {
    sendJson(response, 400, { ok: false, error: "invalid_line_credentials" });
    return;
  }

  const providerConfig = { channelId, channelSecret };
  let lineAccessToken;

  try {
    lineAccessToken = await issueStatelessLineToken(fetchImpl, providerConfig);
  } catch {
    sendJson(response, 400, { ok: false, error: "line_credentials_rejected" });
    return;
  }

  await storeProviderConfig(fetchImpl, config, providerConfig);

  const setWebhookResponse = await fetchImpl(
    "https://api.line.me/v2/bot/channel/webhook/endpoint",
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: WEBHOOK_URL }),
    },
  );

  if (!setWebhookResponse.ok) {
    sendJson(response, 502, { ok: false, error: "webhook_setup_failed" });
    return;
  }

  const testWebhookResponse = await fetchImpl(
    "https://api.line.me/v2/bot/channel/webhook/test",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: WEBHOOK_URL }),
    },
  );

  let testSuccess = testWebhookResponse.ok;
  try {
    const testResult = await testWebhookResponse.json();
    if (typeof testResult?.success === "boolean") testSuccess = testResult.success;
  } catch {}

  const infoResponse = await fetchImpl(
    "https://api.line.me/v2/bot/channel/webhook/endpoint",
    {
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  let active = false;
  if (infoResponse.ok) {
    try {
      const info = await infoResponse.json();
      active = info?.active === true;
    } catch {}
  }

  sendJson(response, 200, {
    ok: true,
    webhookUrl: WEBHOOK_URL,
    webhookVerified: testSuccess,
    webhookActive: active,
  });
}

async function handleLineWebhook({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const providerConfig = await loadProviderConfig(fetchImpl, config);
  if (!providerConfig) {
    sendJson(response, 503, { ok: false, error: "line_not_connected" });
    return;
  }

  const rawBody = await readRawBody(request);
  const signature = request.headers["x-line-signature"];

  if (
    !verifyLineSignature(
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
      providerConfig.channelSecret,
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
  const lineAccessToken = await issueStatelessLineToken(fetchImpl, providerConfig);

  const messageTypes = events
    .filter((event) => event?.type === "message")
    .map((event) => String(event?.message?.type ?? "unknown"));
  if (messageTypes.length > 0) {
    console.log(`LINE webhook message types: ${messageTypes.join(",")}`);
  }

  for (const event of events) {
    const normalized = normalizeLineMessageEvent(event);
    if (!normalized) {
      if (event?.type === "message") {
        console.log(
          `LINE webhook message ignored: type=${String(event?.message?.type ?? "unknown")} source=${String(event?.source?.type ?? "unknown")}`,
        );
      }
      continue;
    }

    const profile = await fetchLineProfile(
      fetchImpl,
      lineAccessToken,
      normalized.customerExternalId,
    );

    const { response: persistResponse } = await signedEdgeRequest(fetchImpl, config, {
      action: "inbound",
      organizationId: config.organizationId,
      ...normalized,
      customerDisplayName: profile.displayName,
      customerAvatarUrl: profile.pictureUrl,
    });

    if (!persistResponse.ok) {
      console.log(`LINE inbound persistence failed: type=${normalized.messageType}`);
      throw new Error("inbound persistence failed");
    }
    console.log(`LINE inbound persisted: type=${normalized.messageType}`);
  }

  sendJson(response, 200, { ok: true });
}

async function handleLineProfile({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const userAccessToken = getBearerToken(request);
  if (!userAccessToken) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const user = await fetchAuthenticatedUser(fetchImpl, config, userAccessToken);
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

  if (!isUuid(conversationId)) {
    sendJson(response, 400, { ok: false, error: "invalid_request" });
    return;
  }

  const conversation = await fetchVisibleConversation(
    fetchImpl,
    config,
    userAccessToken,
    conversationId,
  );

  if (!conversation) {
    sendJson(response, 404, { ok: false, error: "conversation_not_found" });
    return;
  }

  const providerConfig = await loadProviderConfig(fetchImpl, config);
  if (!providerConfig) {
    sendJson(response, 503, { ok: false, error: "line_not_connected" });
    return;
  }

  const lineAccessToken = await issueStatelessLineToken(fetchImpl, providerConfig);
  const profile = await fetchLineProfile(
    fetchImpl,
    lineAccessToken,
    conversation.customer_external_id,
  );

  const { response: persistResponse } = await signedEdgeRequest(fetchImpl, config, {
    action: "profile",
    organizationId: config.organizationId,
    conversationId,
    customerDisplayName: profile.displayName,
    customerAvatarUrl: profile.pictureUrl,
  });

  if (!persistResponse.ok) {
    sendJson(response, 500, { ok: false, error: "profile_persistence_failed" });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    customerDisplayName: profile.displayName,
    customerAvatarUrl: profile.pictureUrl,
  });
}

async function handleLineReply({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const userAccessToken = getBearerToken(request);
  if (!userAccessToken) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  const user = await fetchAuthenticatedUser(fetchImpl, config, userAccessToken);
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
    userAccessToken,
    conversationId,
  );

  if (!conversation) {
    sendJson(response, 404, { ok: false, error: "conversation_not_found" });
    return;
  }

  const providerConfig = await loadProviderConfig(fetchImpl, config);
  if (!providerConfig) {
    sendJson(response, 503, { ok: false, error: "line_not_connected" });
    return;
  }

  const lineAccessToken = await issueStatelessLineToken(fetchImpl, providerConfig);
  const lineResponse = await fetchImpl("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineAccessToken}`,
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
  } catch {}

  const { response: persistResponse } = await signedEdgeRequest(fetchImpl, config, {
    action: "outbound",
    organizationId: config.organizationId,
    conversationId,
    body: message,
    providerMessageId,
    sentByUserId: user.id,
    createdAt: new Date().toISOString(),
  });

  if (!persistResponse.ok) {
    sendJson(response, 500, { ok: false, error: "message_persistence_failed" });
    return;
  }

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
        await handleHealth({ response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/line/configure") {
        await handleLineConfigure({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/webhooks/line") {
        await handleLineWebhook({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/line/profile") {
        await handleLineProfile({ request, response, config, fetchImpl });
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
