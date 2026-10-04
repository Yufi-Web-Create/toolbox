import { NextResponse } from "next/server";

import {
  isPlanKey,
  planFeatures,
} from "../../../../../lib/plans";
import { createClient } from "../../../../../lib/supabase/server";

type MessageRow = {
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

function readOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) parts.push(text.trim());
    }
  }

  return parts.join("\n").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const conversationId =
      typeof body?.conversationId === "string"
        ? body.conversationId.trim()
        : "";

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, message: "会話を選択してください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claimsData?.claims?.sub === "string"
        ? claimsData.claims.sub
        : null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1);

    if (
      membershipError ||
      !Array.isArray(memberships) ||
      memberships.length !== 1
    ) {
      return NextResponse.json(
        { ok: false, message: "組織を確認できませんでした。" },
        { status: 403 },
      );
    }

    const organizationId = memberships[0].organization_id;
    const { data: organization } = await supabase
      .from("organizations")
      .select("plan_key")
      .eq("id", organizationId)
      .maybeSingle();
    const plan = isPlanKey(organization?.plan_key)
      ? organization.plan_key
      : "standard";

    if (!planFeatures(plan).ai) {
      return NextResponse.json(
        {
          ok: false,
          message: "AI返信アシスタントはプロ以上のプランで利用できます。",
        },
        { status: 403 },
      );
    }

    const { data: conversations, error: conversationError } = await supabase
      .from("conversations")
      .select("id, provider, customer_display_name")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .limit(1);

    if (
      conversationError ||
      !Array.isArray(conversations) ||
      conversations.length !== 1
    ) {
      return NextResponse.json(
        { ok: false, message: "この会話を参照できません。" },
        { status: 403 },
      );
    }

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (messageError || !Array.isArray(messageData)) {
      return NextResponse.json(
        { ok: false, message: "会話履歴を読み込めませんでした。" },
        { status: 500 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "AI機能は運営設定でAPIキーを設定すると利用できます。",
        },
        { status: 503 },
      );
    }

    const messages = (messageData as MessageRow[]).reverse();
    const conversationText = messages
      .map((message) => {
        const speaker =
          message.direction === "inbound" ? "お客様" : "担当スタッフ";
        return speaker + ": " + message.body;
      })
      .join("\n")
      .slice(-12_000);

    if (!conversationText.trim()) {
      return NextResponse.json(
        { ok: false, message: "返信案を作成できるメッセージがありません。" },
        { status: 400 },
      );
    }

    const conversation = conversations[0];
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions:
          "あなたはOmniBoxのカスタマーサポート返信アシスタントです。会話の事実だけを使い、丁寧で簡潔な日本語の返信案を1つ作成してください。不明な在庫、予約可否、金額、返金、規約などを勝手に確約しないでください。社内メモや分析は出力せず、お客様へ送る返信本文だけを返してください。",
        input:
          "チャネル: " +
          conversation.provider +
          "\nお客様名: " +
          (conversation.customer_display_name || "お客様") +
          "\n\n会話履歴:\n" +
          conversationText +
          "\n\n最後のお客様メッセージに対する返信案を作成してください。",
        max_output_tokens: 500,
      }),
      cache: "no-store",
    });

    const result = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok || !result) {
      return NextResponse.json(
        { ok: false, message: "AI返信案を生成できませんでした。" },
        { status: 502 },
      );
    }

    const draft = readOutputText(result).slice(0, 5000);
    if (!draft) {
      return NextResponse.json(
        { ok: false, message: "AI返信案を生成できませんでした。" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, draft, model });
  } catch {
    return NextResponse.json(
      { ok: false, message: "AI返信案を生成できませんでした。" },
      { status: 500 },
    );
  }
}
