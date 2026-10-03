import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendLineReply } from "./server";

const ORIGINAL_ENV = { ...process.env };

describe("sendLineReply", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.LINE_BRIDGE_URL = "https://bridge.example.com";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("forwards the verified Supabase user token to the bridge", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      sendLineReply({
        conversationId: "conversation-1",
        message: "ありがとうございます。",
        accessToken: "user-access-token",
      }),
    ).resolves.toEqual({ success: true });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://bridge.example.com/internal/line/reply");
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: "Bearer user-access-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      conversationId: "conversation-1",
      message: "ありがとうございます。",
    });
  });

  it("uses the deployed bridge URL by default", async () => {
    delete process.env.LINE_BRIDGE_URL;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await sendLineReply({
      conversationId: "conversation-1",
      message: "hello",
      accessToken: "user-access-token",
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://omnibox-line-bridge.onrender.com/internal/line/reply",
    );
  });

  it("fails safely without an authenticated user token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await sendLineReply({
      conversationId: "conversation-1",
      message: "hello",
      accessToken: "",
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
      accessToken: "user-access-token",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(rawProviderError);
  });
});
