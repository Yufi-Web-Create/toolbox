import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendReply, type ReplyState } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
  sendLineReply: vi.fn(),
  revalidatePath: vi.fn(),
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

    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      from: mocks.from,
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "10000000-0000-0000-0000-000000000001" } },
      error: null,
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({
      data: [{ id: "conversation-1" }],
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
    expect(mocks.from).not.toHaveBeenCalled();
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

  it("sends only after authentication and RLS visibility checks pass", async () => {
    const result = await sendReply(
      initialState,
      replyData("conversation-1", "  ありがとうございます。  "),
    );

    expect(mocks.from).toHaveBeenCalledWith("conversations");
    expect(mocks.eq).toHaveBeenCalledWith("id", "conversation-1");
    expect(mocks.sendLineReply).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      message: "ありがとうございます。",
      sentByUserId: "10000000-0000-0000-0000-000000000001",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/inbox");
    expect(result).toEqual({
      status: "success",
      message: "LINEへ返信を送信しました。",
    });
  });

  it("returns the safe adapter error without marking a failed LINE send successful", async () => {
    mocks.sendLineReply.mockResolvedValue({
      success: false,
      message: "LINEへの返信を送信できませんでした。接続設定を確認してもう一度お試しください。",
    });

    const result = await sendReply(initialState, replyData());

    expect(result.status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
