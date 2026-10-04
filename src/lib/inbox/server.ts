import { createClient } from "../supabase/server";

export type InboxConversation = {
  id: string;
  organization_id: string;
  provider: "line" | "instagram" | "x" | "email";
  provider_connection_id: string | null;
  provider_thread_id: string;
  customer_external_id: string;
  customer_display_name: string;
  customer_avatar_url: string | null;
  customer_name_source: "provider" | "custom";
  assignee_user_id: string | null;
  status: "unread" | "in_progress" | "completed";
  last_message_preview: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

export type InboxMessage = {
  id: string;
  organization_id: string;
  conversation_id: string;
  provider_connection_id: string | null;
  provider_message_id: string | null;
  direction: "inbound" | "outbound";
  body: string;
  sent_by_user_id: string | null;
  created_at: string;
};

export type InboxSnapshot =
  | {
      success: true;
      conversations: InboxConversation[];
      selectedConversation: InboxConversation | null;
      messages: InboxMessage[];
    }
  | {
      success: false;
      message: string;
    };

const INBOX_LOAD_ERROR = "受信箱を読み込めませんでした。もう一度お試しください。";

export async function getInboxSnapshot(
  organizationId: string,
  requestedConversationId?: string | null,
): Promise<InboxSnapshot> {
  try {
    const supabase = await createClient();
    const { data: conversationData, error: conversationError } = await supabase
      .from("conversations")
      .select(
        "id, organization_id, provider, provider_connection_id, provider_thread_id, customer_external_id, customer_display_name, customer_avatar_url, customer_name_source, assignee_user_id, status, last_message_preview, last_message_at, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (conversationError || !Array.isArray(conversationData)) {
      return { success: false, message: INBOX_LOAD_ERROR };
    }

    const conversations = conversationData as InboxConversation[];
    const selectedConversation =
      conversations.find((conversation) => conversation.id === requestedConversationId) ??
      conversations[0] ??
      null;

    if (!selectedConversation) {
      return {
        success: true,
        conversations,
        selectedConversation: null,
        messages: [],
      };
    }

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select(
        "id, organization_id, conversation_id, provider_connection_id, provider_message_id, direction, body, sent_by_user_id, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("conversation_id", selectedConversation.id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (messageError || !Array.isArray(messageData)) {
      return { success: false, message: INBOX_LOAD_ERROR };
    }

    return {
      success: true,
      conversations,
      selectedConversation,
      messages: messageData as InboxMessage[],
    };
  } catch {
    return { success: false, message: INBOX_LOAD_ERROR };
  }
}
