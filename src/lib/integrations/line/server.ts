export type LineReplyInput = {
  conversationId: string;
  message: string;
  sentByUserId: string;
};

export type LineReplyResult =
  | { success: true }
  | { success: false; message: string };

const LINE_REPLY_ERROR =
  "LINEへの返信を送信できませんでした。接続設定を確認してもう一度お試しください。";

function getBridgeConfiguration() {
  const bridgeUrl = process.env.LINE_BRIDGE_URL?.trim();
  const internalKey = process.env.LINE_BRIDGE_INTERNAL_KEY?.trim();

  if (!bridgeUrl || !internalKey) {
    return null;
  }

  try {
    return {
      bridgeUrl: new URL(bridgeUrl),
      internalKey,
    };
  } catch {
    return null;
  }
}

export async function sendLineReply(
  input: LineReplyInput,
): Promise<LineReplyResult> {
  const config = getBridgeConfiguration();

  if (!config) {
    return { success: false, message: LINE_REPLY_ERROR };
  }

  try {
    const endpoint = new URL("/internal/line/reply", config.bridgeUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.internalKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId: input.conversationId,
        message: input.message,
        sentByUserId: input.sentByUserId,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { success: false, message: LINE_REPLY_ERROR };
    }

    return { success: true };
  } catch {
    return { success: false, message: LINE_REPLY_ERROR };
  }
}
