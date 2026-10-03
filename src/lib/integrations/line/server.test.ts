import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendLineReply } from "./server";

const ORIGINAL_ENV = { ...process.env };

describe("sendLineReply", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.LINE_BRIDGE_URL = "https://bridge.example.com";
    process.env.LINE_BRIDGE_INTERNAL_KEY = "server-only-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("sends the reply to the trusted bridge with a server-only bearer value", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      sendLineReply({
        conversationId: "conversation-1",
        message: "ありがとうございます。",
        sentByUserId: "user-1",
      }),
    ).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://bridge.example.com/internal/line/reply");
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: "Bearer server-only-key",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      conversationId: "conversation-1",
      message: "ありがとうございます。",
      sentByUserId: "user-1",
    });
  });

  it("fails safely and does not call the network when bridge config is missing", async () => {
    delete process.env.LINE_BRIDGE_INTERNAL_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await sendLineReply({
      conversationId: "conversation-1",
      message: "hello",
      sentByUserId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose bridge response details when the bridge rejects the send", async () => {
    const rawProviderError = "provider token invalid";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(rawProviderError, { status: 502 }),
    );

    const result = await sendLineReply({
      conversationId: "conversation-1",
      message: "hello",
      sentByUserId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(rawProviderError);
  });
});
