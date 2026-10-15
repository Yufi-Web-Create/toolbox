"use server";

import { revalidatePath } from "next/cache";

import { sendLineReply } from "../../../lib/integrations/line/server";
import { createClient } from "../../../lib/supabase/server";

export type ReplyState = {
  status: "idle" | "success" | "error";
  message: string;
};

const AUTH_ERROR = "ログイン状態を確認できませんでした。もう一度ログインしてください。";
const CONVERSATION_ERROR =
  "この会話を確認できませんでした。受信箱を再読み込みしてください。";
const MESSAGE_ERROR = "返信内容を1〜5000文字で入力してください。";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function sendReply(
  _previousState: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const conversationId = readString(formData, "conversationId");
  const message = readString(formData, "message");

  if (!conversationId) {
    return { status: "error", message: CONVERSATION_ERROR };
  }

  if (!message || message.length > 5000) {
    return { status: "error", message: MESSAGE_ERROR };
  }

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claimsData?.claims?.sub === "string"
        ? claimsData.claims.sub
        : null;

    if (!userId) {
      return { status: "error", message: AUTH_ERROR };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";

    if (!accessToken) {
      return { status: "error", message: AUTH_ERROR };
    }

    const { data: visibleConversations, error: conversationError } =
      await supabase
        .from("conversations")
        .select("id, provider")
        .eq("id", conversationId)
        .limit(1);

    if (
      conversationError ||
      !Array.isArray(visibleConversations) ||
      visibleConversations.length !== 1
    ) {
      return { status: "error", message: CONVERSATION_ERROR };
    }

    const provider = visibleConversations[0].provider as string;
    if (provider === "x") {
      return { status: "error", message: "Xは投稿専用です。DMへの返信には対応していません。" };
    }
    if (provider !== "line" && provider !== "instagram" && provider !== "email") {
      return { status: "error", message: "この窓口からの返信には対応していません。" };
    }

    if (provider === "line") {
      const result = await sendLineReply({
        conversationId,
        message,
        accessToken,
      });
      if (!result.success) {
        return { status: "error", message: result.message };
      }
    } else {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      if (!base) {
        return { status: "error", message: "返信サービスの設定を確認できませんでした。" };
      }
      const response = await fetch(new URL("/functions/v1/omnibox-provider-reply", base), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversationId, message }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        return {
          status: "error",
          message: provider === "email"
            ? "Gmailから返信できませんでした。Google連携をご確認ください。"
            : "Instagramへ返信できませんでした。連携権限をご確認ください。",
        };
      }
    }

    revalidatePath("/app/inbox");

    return {
      status: "success",
      message: provider === "email"
        ? "メールを返信しました。"
        : provider === "instagram" ? "Instagramへ返信しました。" : "LINEへ返信を送信しました。",
    };
  } catch {
    return { status: "error", message: CONVERSATION_ERROR };
  }
}
