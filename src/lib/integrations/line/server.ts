export type LineReplyInput = {
  conversationId: string;
  message: string;
  accessToken: string;
};

export type LineReplyResult =
  | { success: true }
  | { success: false; message: string };

const LINE_REPLY_ERROR =
  "LINEへの返信を送信できませんでした。接続設定を確認してもう一度お試しください。";

function getBridgeUrl() {
  const value =
    process.env.LINE_BRIDGE_URL?.trim() ||
    "https://omnibox-line-bridge.onrender.com";

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export async function sendLineReply(
  input: LineReplyInput,
): Promise<LineReplyResult> {
  const bridgeUrl = getBridgeUrl();

  if (!bridgeUrl || !input.accessToken) {
    return { success: false, message: LINE_REPLY_ERROR };
  }

  try {
    const endpoint = new URL("/internal/line/reply", bridgeUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId: input.conversationId,
        message: input.message,
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
