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
const WEBHOOK_BASE_URL = "https://omnibox-line-bridge.onrender.com/webhooks/line";

function lineWebhookUrl(organizationId) {
  return `${WEBHOOK_BASE_URL}/${organizationId}`;
}
const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "BRIDGE_SIGNING_PRIVATE_KEY_PEM",
];

const cachedProviderConfigs = new Map();
const cachedLineTokens = new Map();

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
    signingPrivateKey: env.BRIDGE_SIGNING_PRIVATE_KEY_PEM ?? "",
    providerBridgeKey: env.OMNIBOX_PROVIDER_BRIDGE_KEY?.trim() ?? "",
    vapidPublicKey: env.MATOMEET_VAPID_PUBLIC_KEY?.trim() ?? "",
    vapidPrivateKey: env.MATOMEET_VAPID_PRIVATE_KEY_PEM ?? "",
    vapidSubject:
      env.MATOMEET_VAPID_SUBJECT?.trim() ||
      "https://omnibox-line-bridge.onrender.com",
    lineOrganizationIds: (env.MATOMEET_LINE_ORGANIZATION_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isUuid(value)),
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

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createVapidToken(endpoint, config) {
  const audience = new URL(endpoint).origin;
  const header = encodeBase64Url(
    JSON.stringify({ typ: "JWT", alg: "ES256" }),
  );
  const payload = encodeBase64Url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: config.vapidSubject,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer
    .sign({
      key: config.vapidPrivateKey,
      dsaEncoding: "ieee-p1363",
    })
    .toString("base64url");
  return `${unsignedToken}.${signature}`;
}

async function sendEmptyWebPush(fetchImpl, config, endpoint) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    return { ok: false, status: 0 };
  }

  const token = createVapidToken(endpoint, config);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${config.vapidPublicKey}`,
      TTL: "120",
      Urgency: "high",
    },
  });
  return { ok: response.ok, status: response.status };
}

async function notifyPushSubscribers(fetchImpl, config, organizationId) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return;

  const { response, data } = await signedEdgeRequest(fetchImpl, config, {
    action: "list-push-subscriptions",
    organizationId,
  });

  if (!response.ok || !Array.isArray(data?.endpoints)) {
    throw new Error("push subscription lookup failed");
  }

  const endpoints = Array.from(
    new Set(
      data.endpoints
        .map((value) => String(value ?? "").trim())
        .filter((endpoint) => endpoint.startsWith("https://")),
    ),
  ).slice(0, 100);

  const staleEndpoints = [];
  for (const endpoint of endpoints) {
    try {
      const result = await sendEmptyWebPush(fetchImpl, config, endpoint);
      if (result.status === 404 || result.status === 410) {
        staleEndpoints.push(endpoint);
      }
    } catch {
      console.log("Push notification delivery failed");
    }
  }

  if (staleEndpoints.length > 0) {
    await signedEdgeRequest(fetchImpl, config, {
      action: "remove-push-subscriptions",
      organizationId,
      endpoints: staleEndpoints,
    });
  }
}

async function handleCrossPlatformPush({ request, response, config, fetchImpl }) {
  let payload;
  try { payload = await readJsonBody(request); }
  catch { sendJson(response, 400, { ok: false, error: "invalid_json" }); return; }
  const organizationId = String(payload?.organizationId ?? "");
  const messageId = String(payload?.messageId ?? "");
  if (!isUuid(organizationId) || !isUuid(messageId)) {
    sendJson(response, 400, { ok: false, error: "invalid_ids" });
    return;
  }
  if (!config.vapidPrivateKey || !config.vapidPublicKey) {
    sendJson(response, 503, { ok: false, error: "push_not_configured" });
    return;
  }
  // A candidate is not trusted: verify its existence, freshness and uniqueness
  // with the authenticated Supabase persistence function before sending.
  const { response: checkResponse, data } = await signedEdgeRequest(fetchImpl, config, {
    action: "claim-push-event", organizationId, messageId
  });
  if (!checkResponse.ok || !data?.ok) {
    sendJson(response, 502, { ok: false, error: "push_event_validation_failed" });
    return;
  }
  if (!data.claimed) {
    sendJson(response, 200, { ok: true, ignored: true });
    return;
  }
  try {
    await notifyPushSubscribers(fetchImpl, config, organizationId);
    sendJson(response, 200, { ok: true, notified: true });
  } catch {
    console.error("Cross-platform push notification failed");
    sendJson(response, 502, { ok: false, error: "push_delivery_failed" });
  }
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

function providerBridgeAuthorized(request, config) {
  const provided = request.headers["x-omnibox-provider-key"];
  const key = Array.isArray(provided) ? provided[0] : provided;
  return Boolean(config.providerBridgeKey) && safeStringEqual(key, config.providerBridgeKey);
}

async function storeOperatorProviderConfig(fetchImpl, config, provider, providerConfig) {
  const encrypted = encryptProviderConfig(config, providerConfig);
  const { response } = await signedEdgeRequest(fetchImpl, config, {
    action: "store-operator-config",
    provider,
    ...encrypted,
  });
  if (!response.ok) throw new Error("operator config store failed");
}

async function loadOperatorProviderConfig(fetchImpl, config, provider) {
  const { response, data } = await signedEdgeRequest(fetchImpl, config, {
    action: "get-operator-config",
    provider,
  });
  if (response.status === 404) return null;
  if (!response.ok || !data?.config) throw new Error("operator config lookup failed");
  return decryptProviderConfig(config, data.config);
}

async function storeProviderConfig(fetchImpl, config, organizationId, providerConfig) {
  const encrypted = encryptProviderConfig(config, providerConfig);
  const { response } = await signedEdgeRequest(fetchImpl, config, {
    action: "store-config",
    organizationId,
    ...encrypted,
  });

  if (!response.ok) throw new Error("config store failed");

  cachedProviderConfigs.set(organizationId, {
    value: providerConfig,
    until: Date.now() + 5 * 60 * 1000,
  });
  cachedLineTokens.delete(organizationId);
}

async function loadProviderConfig(fetchImpl, config, organizationId, force = false) {
  const cached = cachedProviderConfigs.get(organizationId);
  if (!force && cached?.value) {
    return cached.value;
  }

  const { response, data } = await signedEdgeRequest(fetchImpl, config, {
    action: "get-config",
    organizationId,
  });

  if (response.status === 404) return null;
  if (!response.ok || !data?.config) throw new Error("config lookup failed");

  const providerConfig = decryptProviderConfig(config, data.config);
  cachedProviderConfigs.set(organizationId, {
    value: providerConfig,
    until: Date.now() + 5 * 60 * 1000,
  });
  return providerConfig;
}

async function issueStatelessLineToken(fetchImpl, providerConfig, organizationId = "") {
  const cached = organizationId ? cachedLineTokens.get(organizationId) : null;
  if (cached?.token && Date.now() < cached.until) {
    return cached.token;
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
  if (organizationId) {
    cachedLineTokens.set(organizationId, {
      token: result.access_token,
      until: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    });
  }
  return result.access_token;
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

async function fetchVisibleOrganization(fetchImpl, config, accessToken, userId) {
  const url = new URL("/rest/v1/organization_members", config.supabaseUrl);
  url.searchParams.set("select", "organization_id,role");
  url.searchParams.set("user_id", `eq.${userId}`);
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

export async function getLineWebhookStatus(fetchImpl, lineAccessToken, expectedWebhookUrl = null) {
  const response = await fetchImpl(
    "https://api.line.me/v2/bot/channel/webhook/endpoint",
    {
      headers: {
        Authorization: "Bearer " + lineAccessToken,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    return {
      lineApiReachable: false,
      webhookUrl: null,
      webhookActive: false,
      webhookMatches: false,
    };
  }

  let info = {};
  try {
    info = await response.json();
  } catch {}

  const endpoint =
    typeof info?.endpoint === "string" && info.endpoint.trim()
      ? info.endpoint.trim()
      : null;

  return {
    lineApiReachable: true,
    webhookUrl: endpoint,
    webhookActive: info?.active === true,
    webhookMatches: expectedWebhookUrl ? endpoint === expectedWebhookUrl : false,
  };
}

async function applyLineWebhook(fetchImpl, lineAccessToken, organizationId) {
  const webhookUrl = lineWebhookUrl(organizationId);
  const setWebhookResponse = await fetchImpl(
    "https://api.line.me/v2/bot/channel/webhook/endpoint",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + lineAccessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: webhookUrl }),
    },
  );

  if (!setWebhookResponse.ok) {
    return { ok: false, error: "webhook_setup_failed" };
  }

  const testWebhookResponse = await fetchImpl(
    "https://api.line.me/v2/bot/channel/webhook/test",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + lineAccessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: webhookUrl }),
    },
  );

  let webhookVerified = testWebhookResponse.ok;
  try {
    const testResult = await testWebhookResponse.json();
    if (typeof testResult?.success === "boolean") {
      webhookVerified = testResult.success;
    }
  } catch {}

  const status = await getLineWebhookStatus(fetchImpl, lineAccessToken, webhookUrl);

  return {
    ok: true,
    webhookUrl,
    webhookVerified,
    ...status,
  };
}

async function handleHealth({ response, config }) {
  sendJson(response, 200, {
    ok: true,
    configured: config.configured,
    bridgeReady: config.configured,
    multiTenant: true,
    missing: config.missing,
  });
}

async function authenticateVisibleOrganization({
  request,
  response,
  config,
  fetchImpl,
}) {
  const userAccessToken = getBearerToken(request);
  if (!userAccessToken) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return null;
  }

  const user = await fetchAuthenticatedUser(fetchImpl, config, userAccessToken);
  const organization = user
    ? await fetchVisibleOrganization(fetchImpl, config, userAccessToken, user.id)
    : null;

  if (!user || !organization) {
    sendJson(response, 403, { ok: false, error: "forbidden" });
    return null;
  }

  return { user, userAccessToken, organization };
}

async function handleLineConfigure({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const auth = await authenticateVisibleOrganization({
    request,
    response,
    config,
    fetchImpl,
  });
  if (!auth) return;

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
    lineAccessToken = await issueStatelessLineToken(
      fetchImpl,
      providerConfig,
      auth.organization.organization_id,
    );
  } catch {
    sendJson(response, 400, { ok: false, error: "line_credentials_rejected" });
    return;
  }

  const organizationId = auth.organization.organization_id;
  await storeProviderConfig(fetchImpl, config, organizationId, providerConfig);
  const result = await applyLineWebhook(fetchImpl, lineAccessToken, organizationId);
  sendJson(response, result.ok ? 200 : 502, result);
}

async function handleLineRepair({ request, response, config, fetchImpl }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const auth = await authenticateVisibleOrganization({
    request,
    response,
    config,
    fetchImpl,
  });
  if (!auth) return;

  let providerConfig;
  try {
    providerConfig = await loadProviderConfig(
      fetchImpl,
      config,
      auth.organization.organization_id,
      true,
    );
  } catch {
    sendJson(response, 502, { ok: false, error: "config_lookup_failed" });
    return;
  }

  if (!providerConfig) {
    sendJson(response, 404, { ok: false, error: "line_not_connected" });
    return;
  }

  let lineAccessToken;
  try {
    lineAccessToken = await issueStatelessLineToken(
      fetchImpl,
      providerConfig,
      auth.organization.organization_id,
    );
  } catch {
    sendJson(response, 502, { ok: false, error: "line_credentials_rejected" });
    return;
  }

  const result = await applyLineWebhook(
    fetchImpl,
    lineAccessToken,
    auth.organization.organization_id,
  );
  sendJson(response, result.ok ? 200 : 502, result);
}


async function handleOperatorLineConfigure({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let payload;
  try { payload = await readJsonBody(request); }
  catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }
  const organizationId =
    typeof payload?.organizationId === "string" ? payload.organizationId.trim() : "";
  const channelId = typeof payload?.channelId === "string" ? payload.channelId.trim() : "";
  const channelSecret = typeof payload?.channelSecret === "string" ? payload.channelSecret.trim() : "";
  if (!isUuid(organizationId) || !/^\d+$/.test(channelId) || channelSecret.length < 16 || channelSecret.length > 256) {
    sendJson(response, 400, { ok: false, error: "invalid_line_credentials" });
    return;
  }
  const providerConfig = { channelId, channelSecret };
  let token;
  try { token = await issueStatelessLineToken(fetchImpl, providerConfig, organizationId); }
  catch {
    sendJson(response, 400, { ok: false, error: "line_credentials_rejected" });
    return;
  }
  await storeProviderConfig(fetchImpl, config, organizationId, providerConfig);
  const result = await applyLineWebhook(fetchImpl, token, organizationId);
  sendJson(response, result.ok ? 200 : 502, result);
}

async function handleOperatorLineRepair({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let payload;
  try { payload = await readJsonBody(request); }
  catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }
  const organizationId =
    typeof payload?.organizationId === "string" ? payload.organizationId.trim() : "";
  if (!isUuid(organizationId)) {
    sendJson(response, 400, { ok: false, error: "invalid_organization_id" });
    return;
  }
  let providerConfig;
  try { providerConfig = await loadProviderConfig(fetchImpl, config, organizationId, true); }
  catch {
    sendJson(response, 502, { ok: false, error: "config_lookup_failed" });
    return;
  }
  if (!providerConfig) {
    sendJson(response, 404, { ok: false, error: "line_not_connected" });
    return;
  }
  let token;
  try { token = await issueStatelessLineToken(fetchImpl, providerConfig, organizationId); }
  catch {
    sendJson(response, 502, { ok: false, error: "line_credentials_rejected" });
    return;
  }
  const result = await applyLineWebhook(fetchImpl, token, organizationId);
  sendJson(response, result.ok ? 200 : 502, result);
}

async function handleOperatorLineStatus({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let payload;
  try { payload = await readJsonBody(request); }
  catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const organizationId =
    typeof payload?.organizationId === "string" ? payload.organizationId.trim() : "";
  if (!isUuid(organizationId)) {
    sendJson(response, 400, { ok: false, error: "invalid_organization_id" });
    return;
  }

  let providerConfig;
  try {
    providerConfig = await loadProviderConfig(fetchImpl, config, organizationId, true);
  } catch {
    sendJson(response, 502, { ok: false, error: "config_lookup_failed" });
    return;
  }

  if (!providerConfig) {
    sendJson(response, 200, {
      ok: true,
      bridgeReady: config.configured,
      lineConnected: false,
      lineApiReachable: false,
      webhookActive: false,
      webhookMatches: false,
      webhookUrl: lineWebhookUrl(organizationId),
    });
    return;
  }

  try {
    const token = await issueStatelessLineToken(fetchImpl, providerConfig, organizationId);
    const status = await getLineWebhookStatus(
      fetchImpl,
      token,
      lineWebhookUrl(organizationId),
    );
    sendJson(response, 200, {
      ok: true,
      bridgeReady: config.configured,
      lineConnected: true,
      ...status,
    });
  } catch {
    sendJson(response, 200, {
      ok: true,
      bridgeReady: config.configured,
      lineConnected: true,
      lineApiReachable: false,
      webhookActive: false,
      webhookMatches: false,
      webhookUrl: lineWebhookUrl(organizationId),
    });
  }
}

async function handleOperatorProviderConfigure({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let payload;
  try { payload = await readJsonBody(request); }
  catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }
  const provider = typeof payload?.provider === "string" ? payload.provider.trim() : "";
  const clientId = typeof payload?.clientId === "string" ? payload.clientId.trim() : "";
  const clientSecret = typeof payload?.clientSecret === "string" ? payload.clientSecret.trim() : "";
  const scopes = Array.isArray(payload?.scopes)
    ? payload.scopes.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
    : [];
  if (!["instagram", "x", "google"].includes(provider) || !clientId || clientId.length > 512 || clientSecret.length < 4 || clientSecret.length > 1024) {
    sendJson(response, 400, { ok: false, error: "invalid_provider_config" });
    return;
  }
  await storeOperatorProviderConfig(fetchImpl, config, provider, { clientId, clientSecret, scopes });
  sendJson(response, 200, { ok: true, provider, configured: true });
}

async function handleOperatorProviderGet({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let payload;
  try { payload = await readJsonBody(request); }
  catch {
    sendJson(response, 400, { ok: false, error: "invalid_json" });
    return;
  }
  const provider = typeof payload?.provider === "string" ? payload.provider.trim() : "";
  if (!["instagram", "x", "google"].includes(provider)) {
    sendJson(response, 400, { ok: false, error: "invalid_provider" });
    return;
  }
  const providerConfig = await loadOperatorProviderConfig(fetchImpl, config, provider);
  if (!providerConfig) {
    sendJson(response, 200, { ok: true, provider, configured: false });
    return;
  }
  sendJson(response, 200, { ok: true, provider, configured: true, config: providerConfig });
}

async function handleOperatorAiConfigure({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
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

  const requestedKey =
    typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  const model =
    typeof payload?.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : "gpt-6-luna";

  if (
    model.length > 128 ||
    !/^[a-z0-9][a-z0-9._:/-]*$/i.test(model)
  ) {
    sendJson(response, 400, { ok: false, error: "invalid_ai_model" });
    return;
  }

  let existing = null;
  if (!requestedKey) {
    try {
      existing = await loadOperatorProviderConfig(fetchImpl, config, "ai");
    } catch {}
  }

  const apiKey =
    requestedKey ||
    (typeof existing?.apiKey === "string" ? existing.apiKey.trim() : "");

  if (apiKey.length < 20 || apiKey.length > 512) {
    sendJson(response, 400, { ok: false, error: "invalid_ai_key" });
    return;
  }

  let validationResponse;
  try {
    validationResponse = await fetchImpl("https://api.openai.com/v1/models", {
      headers: { Authorization: "Bearer " + apiKey },
    });
  } catch {
    sendJson(response, 502, { ok: false, error: "ai_provider_unreachable" });
    return;
  }

  if (!validationResponse.ok) {
    sendJson(response, 400, { ok: false, error: "ai_key_rejected" });
    return;
  }

  await storeOperatorProviderConfig(fetchImpl, config, "ai", {
    provider: "openai",
    apiKey,
    model,
  });

  sendJson(response, 200, {
    ok: true,
    configured: true,
    provider: "openai",
    model,
  });
}

async function handleOperatorAiGet({ request, response, config, fetchImpl }) {
  if (!providerBridgeAuthorized(request, config)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let aiConfig;
  try {
    aiConfig = await loadOperatorProviderConfig(fetchImpl, config, "ai");
  } catch {
    sendJson(response, 502, { ok: false, error: "ai_config_lookup_failed" });
    return;
  }

  if (!aiConfig) {
    sendJson(response, 200, { ok: true, configured: false });
    return;
  }

  const apiKey =
    typeof aiConfig.apiKey === "string" ? aiConfig.apiKey.trim() : "";
  const model =
    typeof aiConfig.model === "string" && aiConfig.model.trim()
      ? aiConfig.model.trim()
      : "gpt-6-luna";

  if (!apiKey) {
    sendJson(response, 200, { ok: true, configured: false });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    configured: true,
    config: {
      provider: "openai",
      apiKey,
      model,
    },
  });
}

async function handleLineWebhook({ request, response, config, fetchImpl, organizationId }) {
  if (!config.configured) {
    sendJson(response, 503, { ok: false, error: "bridge_not_configured" });
    return;
  }

  const providerConfig = await loadProviderConfig(fetchImpl, config, organizationId);
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

  // LINE expects webhook endpoints to acknowledge quickly. Do not wait for
  // profile lookups, token issuance, persistence, or push delivery before 200.
  sendJson(response, 200, { ok: true });

  void (async () => {
    const lineAccessToken = await issueStatelessLineToken(
      fetchImpl,
      providerConfig,
      organizationId,
    );
    let shouldNotifyPush = false;

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
        organizationId,
        ...normalized,
        customerDisplayName: profile.displayName,
        customerAvatarUrl: profile.pictureUrl,
      });

      if (!persistResponse.ok) {
        console.log(`LINE inbound persistence failed: type=${normalized.messageType}`);
        throw new Error("inbound persistence failed");
      }

      console.log(`LINE inbound persisted: type=${normalized.messageType}`);
      shouldNotifyPush = true;
    }

    if (shouldNotifyPush) {
      await notifyPushSubscribers(fetchImpl, config, organizationId);
    }
  })().catch((error) => {
    console.error(
      "LINE webhook background processing failed",
      error instanceof Error ? error.message : "unknown_error",
    );
  });
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

  const organizationId = conversation.organization_id;
  const providerConfig = await loadProviderConfig(fetchImpl, config, organizationId);
  if (!providerConfig) {
    sendJson(response, 503, { ok: false, error: "line_not_connected" });
    return;
  }

  const lineAccessToken = await issueStatelessLineToken(fetchImpl, providerConfig, organizationId);
  const profile = await fetchLineProfile(
    fetchImpl,
    lineAccessToken,
    conversation.customer_external_id,
  );

  const { response: persistResponse } = await signedEdgeRequest(fetchImpl, config, {
    action: "profile",
    organizationId,
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

  const organizationId = conversation.organization_id;
  const providerConfig = await loadProviderConfig(fetchImpl, config, organizationId);
  if (!providerConfig) {
    sendJson(response, 503, { ok: false, error: "line_not_connected" });
    return;
  }

  const lineAccessToken = await issueStatelessLineToken(
    fetchImpl,
    providerConfig,
    organizationId,
  );
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
    organizationId,
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

      if (request.method === "POST" && url.pathname === "/internal/line/repair") {
        await handleLineRepair({ request, response, config, fetchImpl });
        return;
      }


      if (request.method === "POST" && url.pathname === "/internal/operator/line/configure") {
        await handleOperatorLineConfigure({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/operator/line/repair") {
        await handleOperatorLineRepair({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/operator/line/status") {
        await handleOperatorLineStatus({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/operator/provider/configure") {
        await handleOperatorProviderConfigure({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/operator/provider/get") {
        await handleOperatorProviderGet({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/operator/ai/configure") {
        await handleOperatorAiConfigure({ request, response, config, fetchImpl });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/operator/ai/get") {
        await handleOperatorAiGet({ request, response, config, fetchImpl });
        return;
      }

      const lineWebhookMatch = url.pathname.match(
        /^\/webhooks\/line\/([0-9a-f-]{36})$/i,
      );
      if (request.method === "POST" && lineWebhookMatch) {
        const organizationId = lineWebhookMatch[1];
        if (!isUuid(organizationId)) {
          sendJson(response, 404, { ok: false, error: "not_found" });
          return;
        }
        await handleLineWebhook({
          request,
          response,
          config,
          fetchImpl,
          organizationId,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/internal/push/dispatch") {
        await handleCrossPlatformPush({ request, response, config, fetchImpl });
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
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const config = getBridgeConfiguration(env);
  const server = createLineBridgeServer({ ...options, env, fetchImpl });
  const port = config.port;

  server.listen(port, () => {
    console.log(`LINE bridge listening on port ${port}`);

    for (const organizationId of config.lineOrganizationIds) {
      void (async () => {
        const providerConfig = await loadProviderConfig(
          fetchImpl,
          config,
          organizationId,
          true,
        );
        if (!providerConfig) return;
        await issueStatelessLineToken(fetchImpl, providerConfig, organizationId);
        console.log(`LINE connection warmed: organization=${organizationId}`);
      })().catch(() => {
        console.log(`LINE connection warmup failed: organization=${organizationId}`);
      });
    }
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLineBridge();
}
