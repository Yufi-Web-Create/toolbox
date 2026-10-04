import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInboxSnapshot } from "./server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  conversationSelect: vi.fn(),
  conversationOrder: vi.fn(),
  conversationLimit: vi.fn(),
  messageSelect: vi.fn(),
  messageEq: vi.fn(),
  messageOrder: vi.fn(),
  messageLimit: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  createClient: mocks.createClient,
}));

describe("getInboxSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createClient.mockResolvedValue({
      from: mocks.from,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "conversations") {
        return { select: mocks.conversationSelect };
      }

      if (table === "messages") {
        return { select: mocks.messageSelect };
      }

      throw new Error(`unexpected table: ${table}`);
    });

    mocks.conversationSelect.mockReturnValue({
      order: mocks.conversationOrder,
    });
    mocks.conversationOrder.mockReturnValue({
      limit: mocks.conversationLimit,
    });

    mocks.messageSelect.mockReturnValue({
      eq: mocks.messageEq,
    });
    mocks.messageEq.mockReturnValue({
      order: mocks.messageOrder,
    });
    mocks.messageOrder.mockReturnValue({
      limit: mocks.messageLimit,
    });
  });

  it("loads RLS-visible conversations and messages for the selected conversation", async () => {
    const conversations = [
      {
        id: "conversation-a",
        organization_id: "organization-a",
        provider: "line",
        provider_thread_id: "line:user:U1",
        customer_external_id: "U1",
        customer_display_name: "Customer A",
        status: "unread",
        last_message_preview: "hello",
        last_message_at: "2026-10-03T05:00:00.000Z",
        created_at: "2026-10-03T05:00:00.000Z",
        updated_at: "2026-10-03T05:00:00.000Z",
      },
      {
        id: "conversation-b",
        organization_id: "organization-a",
        provider: "line",
        provider_thread_id: "line:user:U2",
        customer_external_id: "U2",
        customer_display_name: "Customer B",
        status: "in_progress",
        last_message_preview: "question",
        last_message_at: "2026-10-03T04:00:00.000Z",
        created_at: "2026-10-03T04:00:00.000Z",
        updated_at: "2026-10-03T04:00:00.000Z",
      },
    ];
    const messages = [
      {
        id: "message-1",
        organization_id: "organization-a",
        conversation_id: "conversation-b",
        provider_message_id: "line-message-1",
        direction: "inbound",
        body: "question",
        sent_by_user_id: null,
        created_at: "2026-10-03T04:00:00.000Z",
      },
    ];

    mocks.conversationLimit.mockResolvedValue({
      data: conversations,
      error: null,
    });
    mocks.messageLimit.mockResolvedValue({
      data: messages,
      error: null,
    });

    await expect(getInboxSnapshot("conversation-b")).resolves.toEqual({
      success: true,
      conversations,
      selectedConversation: conversations[1],
      messages,
    });

    expect(mocks.from).toHaveBeenNthCalledWith(1, "conversations");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "messages");
    expect(mocks.messageEq).toHaveBeenCalledWith(
      "conversation_id",
      "conversation-b",
    );
  });

  it("returns an empty snapshot without querying messages when there are no visible conversations", async () => {
    mocks.conversationLimit.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(getInboxSnapshot()).resolves.toEqual({
      success: true,
      conversations: [],
      selectedConversation: null,
      messages: [],
    });

    expect(mocks.messageSelect).not.toHaveBeenCalled();
  });

  it("falls back to the first RLS-visible conversation instead of trusting an arbitrary id", async () => {
    const conversation = {
      id: "conversation-a",
      organization_id: "organization-a",
      provider: "line",
      provider_thread_id: "line:user:U1",
      customer_external_id: "U1",
      customer_display_name: "Customer A",
      status: "unread",
      last_message_preview: "hello",
      last_message_at: "2026-10-03T05:00:00.000Z",
      created_at: "2026-10-03T05:00:00.000Z",
      updated_at: "2026-10-03T05:00:00.000Z",
    };

    mocks.conversationLimit.mockResolvedValue({
      data: [conversation],
      error: null,
    });
    mocks.messageLimit.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await getInboxSnapshot("not-visible");

    expect(result).toMatchObject({
      success: true,
      selectedConversation: conversation,
    });
    expect(mocks.messageEq).toHaveBeenCalledWith(
      "conversation_id",
      "conversation-a",
    );
  });

  it("fails closed with a safe message when the provider query fails", async () => {
    const rawError = "raw database details";
    mocks.conversationLimit.mockResolvedValue({
      data: null,
      error: { message: rawError },
    });

    const result = await getInboxSnapshot();

    expect(result).toEqual({
      success: false,
      message: "受信箱を読み込めませんでした。もう一度お試しください。",
    });
    expect(JSON.stringify(result)).not.toContain(rawError);
  });
});
