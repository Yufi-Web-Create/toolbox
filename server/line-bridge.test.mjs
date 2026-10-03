import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import {
  createLineBridgeServer,
  getBridgeConfiguration,
  normalizeLineTextEvent,
  verifyLineSignature,
} from "./line-bridge.mjs";

test("verifyLineSignature validates the exact raw request bytes", () => {
  const secret = "test-channel-secret";
  const rawBody = Buffer.from('{"events":[]}');
  const signature = createHmac("sha256", secret).update(rawBody).digest("base64");

  assert.equal(verifyLineSignature(rawBody, signature, secret), true);
  assert.equal(verifyLineSignature(Buffer.from('{"events": [ ]}'), signature, secret), false);
  assert.equal(verifyLineSignature(rawBody, "wrong", secret), false);
});

test("normalizeLineTextEvent accepts supported LINE user text messages", () => {
  assert.deepEqual(normalizeLineTextEvent({
    type: "message",
    timestamp: 1790990000000,
    source: { type: "user", userId: "U123" },
    message: { type: "text", id: "message-1", text: "予約できますか？" },
  }), {
    customerExternalId: "U123",
    providerThreadId: "line:user:U123",
    providerMessageId: "message-1",
    body: "予約できますか？",
    occurredAt: new Date(1790990000000).toISOString(),
  });
});

test("core bridge configuration does not require LINE credentials in environment", () => {
  const config = getBridgeConfiguration({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-key",
    OMNIBOX_ORGANIZATION_ID: "919201e2-7c75-4c96-bc74-cb3b08da5a04",
    BRIDGE_SIGNING_PRIVATE_KEY_PEM: "private-key",
  });

  assert.equal(config.configured, true);
  assert.deepEqual(config.missing, []);
});

test("health reports disconnected when no encrypted LINE config exists yet", async () => {
  const server = createLineBridgeServer({
    env: {
      PORT: "0",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public-key",
      OMNIBOX_ORGANIZATION_ID: "919201e2-7c75-4c96-bc74-cb3b08da5a04",
      BRIDGE_SIGNING_PRIVATE_KEY_PEM: "not-used-by-mocked-fetch",
    },
    fetchImpl: async () => new Response(
      JSON.stringify({ ok: false, error: "config_not_found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    ),
  });
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.configured, true);
    assert.equal(body.lineConnected, false);
  } finally {
    server.close();
    await once(server, "close");
  }
});
