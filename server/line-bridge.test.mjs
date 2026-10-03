import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import {
  createLineBridgeServer,
  normalizeLineTextEvent,
  verifyLineSignature,
} from "./line-bridge.mjs";

test("verifyLineSignature validates the exact raw request bytes", () => {
  const secret = "test-channel-secret";
  const rawBody = Buffer.from('{"events":[]}');
  const signature = createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  assert.equal(verifyLineSignature(rawBody, signature, secret), true);
  assert.equal(
    verifyLineSignature(Buffer.from('{"events": [ ]}'), signature, secret),
    false,
  );
  assert.equal(verifyLineSignature(rawBody, "wrong", secret), false);
});

test("normalizeLineTextEvent accepts supported LINE user text messages", () => {
  const normalized = normalizeLineTextEvent({
    type: "message",
    timestamp: 1790990000000,
    source: {
      type: "user",
      userId: "U123",
    },
    message: {
      type: "text",
      id: "message-1",
      text: "予約できますか？",
    },
  });

  assert.deepEqual(normalized, {
    customerExternalId: "U123",
    providerThreadId: "line:user:U123",
    providerMessageId: "message-1",
    body: "予約できますか？",
    occurredAt: new Date(1790990000000).toISOString(),
  });
});

test("normalizeLineTextEvent ignores unsupported events", () => {
  assert.equal(
    normalizeLineTextEvent({
      type: "follow",
      source: { type: "user", userId: "U123" },
    }),
    null,
  );

  assert.equal(
    normalizeLineTextEvent({
      type: "message",
      source: { type: "group", groupId: "G123" },
      message: { type: "text", id: "m1", text: "hello" },
    }),
    null,
  );

  assert.equal(
    normalizeLineTextEvent({
      type: "message",
      source: { type: "user", userId: "U123" },
      message: { type: "image", id: "m1" },
    }),
    null,
  );
});

test("health endpoint stays available when provider secrets are not configured", async () => {
  const server = createLineBridgeServer({ env: { PORT: "0" } });
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      configured: false,
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("live webhook endpoint fails closed when bridge is unconfigured", async () => {
  const server = createLineBridgeServer({ env: { PORT: "0" } });
  server.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/webhooks/line`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-line-signature": "not-a-real-signature",
        },
        body: JSON.stringify({ events: [] }),
      },
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "bridge_not_configured",
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});
