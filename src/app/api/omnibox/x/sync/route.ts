import { NextResponse } from "next/server";

import { isPlanKey, PLAN_DEFINITIONS } from "../../../../../lib/plans";
import { createClient } from "../../../../../lib/supabase/server";

const syncErrors: Record<string, string> = {
  x_credentials_unavailable: "Xの接続情報を取得できませんでした。Xを再連携してください。",
  x_reconnect_required: "Xの認証を更新できませんでした。Xを再連携してください。",
  x_credits_depleted: "X APIのクレジットが不足しています。X開発者コンソールの残高を確認してください。",
  x_access_denied: "X APIがDM取得を拒否しました。X開発者コンソールで利用権限とAPI利用状況を確認してください。",
  x_rate_limited: "X APIの取得回数制限に達しました。時間を置いて再度同期してください。",
  x_api_error: "X APIでDM取得に失敗しました。再度同期し、続く場合はお問い合わせください。",
  x_api_partial_error: "XのDMを一部取得できませんでした。再度同期してください。",
  x_token_save_failed: "Xの認証情報を保存できませんでした。再度同期してください。",
  x_message_save_failed: "XのDMを保存できませんでした。再度同期してください。",
  x_sync_unavailable: "XのDM同期中に通信エラーが発生しました。再度同期してください。",
};

function syncUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-x-sync", base) : null;
}

export async function POST() {
  try {
    const endpoint = syncUrl();
    if (!endpoint) {
      return NextResponse.json(
        { ok: false, message: "X DM同期を開始できませんでした。" },
        { status: 500 },
      );
    }

    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claims?.claims?.sub !== "string") {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", claims.claims.sub)
      .limit(1);
    const organizationId =
      Array.isArray(memberships) && memberships.length === 1
        ? memberships[0].organization_id
        : null;
    const { data: organization } = organizationId
      ? await supabase
          .from("organizations")
          .select("plan_key")
          .eq("id", organizationId)
          .maybeSingle()
      : { data: null };
    const plan = isPlanKey(organization?.plan_key)
      ? organization.plan_key
      : "standard";

    if (!PLAN_DEFINITIONS[plan].xDm) {
      return NextResponse.json(
        { ok: false, message: "X DMはスタンダード以上のプランで利用できます。" },
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      return NextResponse.json(
        { ok: false, message: syncErrors[result.error] ?? "XのDMを同期できませんでした。" },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      accounts: Number(result.accounts ?? 0),
      imported: Number(result.imported ?? 0),
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "XのDMを同期できませんでした。" },
      { status: 500 },
    );
  }
}
