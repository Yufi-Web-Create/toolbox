import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendReply, type ReplyState } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getSession: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
  sendLineReply: vi.fn(),
  revalidatePath: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../../../lib/integrations/line/server", () => ({
  sendLineReply: mocks.sendLineReply,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

const initialState: ReplyState = {
  status: "idle",
  message: "",
};

function replyData(conversationId = "conversation-1", message = "hello") {
  const formData = new FormData();
  formData.set("conversationId", conversationId);
  formData.set("message", message);
  return formData;
}

describe("sendReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubGlobal("fetch", mocks.fetch);

    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: mocks.getClaims,
        getSession: mocks.getSession,
      },
      from: mocks.from,
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "10000000-0000-0000-0000-000000000001" } },
      error: null,
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-user-token" } },
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({
      data: [{ id: "conversation-1", provider: "line" }],
      error: null,
    });
    mocks.sendLineReply.mockResolvedValue({ success: true });
  });

  it("rejects blank replies before authentication or provider calls", async () => {
    const result = await sendReply(
      initialState,
      replyData("conversation-1", "   "),
    );

    expect(result.status).toBe("error");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.sendLineReply).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated submissions before provider calls", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });

    const result = await sendReply(initialState, replyData());

    expect(result.status).toBe("error");
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.sendLineReply).not.toHaveBeenCalled();
  });

  it("rejects a missing session token after claims verification", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await sendReply(initialState, replyData());

    expect(result.status).toBe("error");
    expect(mocks.sendLineReply).not.toHaveBeenCalled();
  });

  it("rejects conversations that are not visible through RLS", async () => {
    mocks.limit.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await sendReply(initialState, replyData());

    expect(result.status).toBe("error");
    expect(mocks.sendLineReply).not.toHaveBeenCalled();
  });

  it("does not call LINE transport for an encrypted X Chat thread", async () => {
    mocks.limit.mockResolvedValue({ data: [{ id: "conversation-1", provider: "x" }], error: null });
    const result = await sendReply(initialState, replyData());
    expect(result.status).toBe("error");
    expect(result.message).toContain("投稿専用");
    expect(mocks.sendLineReply).not.toHaveBeenCalled();
  });

  it("sends Gmail replies to the correct provider service, not LINE", async () => {
    mocks.limit.mockResolvedValue({
      data: [{ id: "conversation-1", provider: "email" }], error: null,
    });
    mocks.fetch.mockResolvedValue(Response.json({ ok: true, provider: "email" }));
    const result = await sendReply(initialState, replyData("conversation-1", "お返事です"));
    expect(result).toEqual({ status: "success", message: "メールを返信しました。" });
    expect(mocks.sendLineReply).not.toHaveBeenCalled();
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("https://example.supabase.co/functions/v1/omnibox-provider-reply");
    expect(JSON.parse(options.body)).toEqual({ conversationId: "conversation-1", message: "お返事です" });
  });
  it("does not falsely report success when Gmail rejects the reply", async () => {
    mocks.limit.mockResolvedValue({
      data: [{ id: "conversation-1", provider: "email" }], error: null,
    });
    mocks.fetch.mockResolvedValue(Response.json({ ok: false, error: "gmail_send_failed" }, { status: 502 }));
    const result = await sendReply(initialState, replyData());
    expect(result.status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sends only after authentication and RLS visibility checks pass", async () => {
    const result = await sendReply(
      initialState,
      replyData("conversation-1", "  ありがとうございます。  "),
    );

    expect(mocks.sendLineReply).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      message: "ありがとうございます。",
      accessToken: "verified-user-token",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/inbox");
    expect(result).toEqual({
      status: "success",
      message: "LINEへ返信を送信しました。",
    });
  });
});
