import { NextResponse } from "next/server";

import { sendLineReply } from "../../../../lib/integrations/line/server";
import { createClient } from "../../../../lib/supabase/server";

function providerReplyUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-provider-reply", base) : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!conversationId || !message || message.length > 5000) {
      return NextResponse.json(
        { ok: false, message: "返信内容を確認してください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claimsData?.claims?.sub !== "string") {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: conversations, error: conversationError } = await supabase
      .from("conversations")
      .select("id, provider")
      .eq("id", conversationId)
      .limit(1);

    if (
      conversationError ||
      !Array.isArray(conversations) ||
      conversations.length !== 1
    ) {
      return NextResponse.json(
        { ok: false, message: "この会話へ返信する権限がありません。" },
        { status: 403 },
      );
    }

    const provider = conversations[0].provider;

    if (provider === "line") {
      const result = await sendLineReply({
        conversationId,
        message,
        accessToken,
      });

      if (!result.success) {
        return NextResponse.json(
          { ok: false, message: result.message },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true, provider: "line" });
    }

    if (provider !== "instagram" && provider !== "email" && provider !== "x") {
      return NextResponse.json(
        { ok: false, message: "このチャネルへの返信はまだ対応していません。" },
        { status: 501 },
      );
    }

    const endpoint = providerReplyUrl();
    if (!endpoint) {
      return NextResponse.json(
        { ok: false, message: "返信サービスを開始できませんでした。" },
        { status: 500 },
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId, message }),
      cache: "no-store",
    });

    let result: Record<string, unknown> = {};
    try {
      result = await response.json();
    } catch {}

    if (!response.ok || result.ok !== true) {
      const error = typeof result.error === "string" ? result.error : "";
      const messageText =
        error === "google_token_refresh_failed"
          ? "Googleの認証期限が切れています。Googleアカウントを再連携してください。"
          : error === "instagram_send_failed"
            ? "Instagramへ送信できませんでした。連携権限をご確認ください。"
            : error === "gmail_send_failed"
              ? "Gmailから返信を送信できませんでした。"
              : error === "x_send_failed"
                ? "XのDMを送信できませんでした。連携権限をご確認ください。"
                : error === "provider_connection_unavailable"
                ? "SNS連携が無効です。連携アカウントをご確認ください。"
                : "返信を送信できませんでした。";

      return NextResponse.json(
        { ok: false, message: messageText },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    return NextResponse.json({ ok: true, provider });
  } catch {
    return NextResponse.json(
      { ok: false, message: "返信を送信できませんでした。" },
      { status: 500 },
    );
  }
}
