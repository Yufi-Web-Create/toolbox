import { NextResponse } from "next/server";

import { sendLineReply } from "../../../../lib/integrations/line/server";
import { createClient } from "../../../../lib/supabase/server";

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
      .select("id")
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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "返信を送信できませんでした。" },
      { status: 500 },
    );
  }
}
