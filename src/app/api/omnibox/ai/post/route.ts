import { NextResponse } from "next/server";

import { getAiRuntimeConfig } from "../../../../../lib/ai-config";
import { isPlanKey, planFeatures } from "../../../../../lib/plans";
import { createClient } from "../../../../../lib/supabase/server";

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
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";

    if (!brief) {
      return NextResponse.json(
        { ok: false, message: "投稿に載せたい情報を入力してください。" },
        { status: 400 },
      );
    }

    if (brief.length > 5000) {
      return NextResponse.json(
        { ok: false, message: "入力内容は5000文字以内にしてください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
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
        { ok: false, message: "AI投稿アシスタントはプロ以上のプランで利用できます。" },
        { status: 403 },
      );
    }

    const aiRuntime = await getAiRuntimeConfig();
    if (!aiRuntime) {
      return NextResponse.json(
        {
          ok: false,
          message: "AI実行環境が設定されていません。運営設定をご確認ください。",
        },
        { status: 503 },
      );
    }

    const endpoint =
      aiRuntime.provider === "gateway"
        ? "https://ai-gateway.vercel.sh/v1/responses"
        : "https://api.openai.com/v1/responses";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + aiRuntime.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiRuntime.model,
        store: false,
        instructions:
          "あなたは店舗・事業者向けSNS投稿文アシスタントです。ユーザーが入力した事実だけを使い、InstagramとXの両方で違和感なく使える自然な日本語の投稿文を1案作成してください。未確認の価格・営業時間・在庫・キャンペーン条件などを勝手に補完しないでください。必要に応じて読みやすい改行と関連性の高いハッシュタグを加えてください。説明や分析は書かず、投稿本文だけを返してください。",
        input:
          "投稿に載せたい情報:\n" +
          brief +
          "\n\nこの内容をもとに、そのまま投稿内容欄へ入れられる文章を作成してください。",
        max_output_tokens: 800,
      }),
      cache: "no-store",
    });

    const result = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok || !result) {
      return NextResponse.json(
        { ok: false, message: "AI投稿文を生成できませんでした。" },
        { status: 502 },
      );
    }

    const draft = readOutputText(result).slice(0, 5000);
    if (!draft) {
      return NextResponse.json(
        { ok: false, message: "AI投稿文を生成できませんでした。" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, draft, model: aiRuntime.model });
  } catch {
    return NextResponse.json(
      { ok: false, message: "AI投稿文を生成できませんでした。" },
      { status: 500 },
    );
  }
}
