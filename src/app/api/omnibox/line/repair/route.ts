import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

export async function POST() {
  try {
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
        { ok: false, message: "管理者のみLINE接続を再設定できます。" },
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

    const response = await fetch(new URL("/internal/line/repair", BRIDGE_URL), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });

    const result = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok || result.ok !== true) {
      const code = typeof result.error === "string" ? result.error : "";
      const message =
        code === "line_not_connected"
          ? "LINE接続情報がありません。先にLINE公式アカウントを接続してください。"
          : code === "line_credentials_rejected"
            ? "LINEの認証情報が無効です。LINE公式アカウントを再接続してください。"
            : "LINE Webhookを再設定できませんでした。";
      return NextResponse.json(
        { ok: false, message },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      webhookUrl:
        typeof result.webhookUrl === "string" ? result.webhookUrl : null,
      webhookVerified: result.webhookVerified === true,
      webhookActive: result.webhookActive === true,
      webhookMatches: result.webhookMatches === true,
      lineApiReachable: result.lineApiReachable === true,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "LINE Webhookを再設定できませんでした。" },
      { status: 500 },
    );
  }
}
