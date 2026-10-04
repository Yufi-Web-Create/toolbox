import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const channelId =
      typeof payload?.channelId === "string" ? payload.channelId.trim() : "";
    const channelSecret =
      typeof payload?.channelSecret === "string" ? payload.channelSecret.trim() : "";
    const accountName =
      typeof payload?.accountName === "string" ? payload.accountName.trim() : "";

    if (!/^\d+$/.test(channelId) || channelSecret.length < 16) {
      return NextResponse.json(
        { ok: false, message: "Channel ID / Channel Secret を確認してください。" },
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

    const userId = claimsData.claims.sub;
    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .limit(1);

    if (
      membershipError ||
      !Array.isArray(memberships) ||
      memberships.length !== 1 ||
      memberships[0].role !== "owner"
    ) {
      return NextResponse.json(
        { ok: false, message: "LINE公式アカウントの連携は管理者のみ行えます。" },
        { status: 403 },
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

    const response = await fetch(new URL("/internal/line/configure", BRIDGE_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channelId, channelSecret }),
      cache: "no-store",
    });

    let result: Record<string, unknown> = {};
    try {
      result = await response.json();
    } catch {}

    if (!response.ok || result.ok !== true) {
      const code = typeof result.error === "string" ? result.error : "";
      const message =
        code === "line_credentials_rejected"
          ? "LINEのChannel IDまたはChannel Secretが正しくありません。"
          : "LINE公式アカウントへ接続できませんでした。設定をご確認ください。";

      return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    const { data: metadataUpdated, error: metadataError } = await supabase.rpc(
      "omnibox_update_line_connection_metadata",
      {
        p_account_name: accountName || "LINE公式アカウント",
        p_channel_id: channelId,
      },
    );

    if (metadataError || metadataUpdated !== true) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "LINEへの接続は確認できましたが、OmniBoxへの連携情報を保存できませんでした。もう一度お試しください。",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      webhookUrl: result.webhookUrl,
      webhookVerified: result.webhookVerified === true,
      webhookActive: result.webhookActive === true,
      webhookMatches: result.webhookMatches === true,
      lineApiReachable: result.lineApiReachable === true,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "LINE公式アカウントへ接続できませんでした。" },
      { status: 500 },
    );
  }
}
