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
  xchat_access_denied: "X Chat APIへのアクセスが拒否されました。XのAPI権限をご確認ください。",
  xchat_api_error: "X Chat APIから情報を取得できませんでした。",
  xchat_account_unavailable: "X Chatのアカウント識別情報を確認できませんでした。",
  xchat_key_record_unavailable: "X Chatの公開鍵登録を確認できませんでした。",
  xchat_connection_not_found: "この組織のX連携が見つかりません。",
  xchat_invalid_conversation: "X Chatの会話識別子が無効です。",
  xchat_invalid_user: "X Chatの利用者識別子が無効です。",
  xchat_invalid_resource: "X Chatの読み取り対象が無効です。",
};

function syncUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-x-sync", base) : null;
}

export async function POST(request?: Request) {
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

    const input = await request?.json().catch(() => ({})) ?? {};
    const chatStatusMode = input?.mode === "chat_status";
    const chatKeyStatusMode = input?.mode === "chat_key_status";
    const chatReadMode = input?.mode === "chat_read";
    if (chatReadMode && (
      typeof input.connection_id !== "string" || !/^[a-f0-9-]{36}$/i.test(input.connection_id) ||
      !["bootstrap", "conversations", "events", "public_keys", "recovery_status"].includes(input.resource) ||
      (input.resource === "events" && typeof input.conversation_id !== "string") ||
      (input.resource === "public_keys" && typeof input.user_id !== "string")
    )) {
      return NextResponse.json({ ok: false, message: "X Chatの取得条件が無効です。" }, { status: 400 });
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(chatReadMode ? { mode: "chat_read", resource: input.resource, connection_id: input.connection_id, conversation_id: input.conversation_id, user_id: input.user_id } : chatKeyStatusMode ? { mode: "chat_key_status" } : chatStatusMode ? { mode: "chat_status" } : {}),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      return NextResponse.json(
        { ok: false, message: syncErrors[result.error] ?? "XのDMを同期できませんでした。" },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    if (chatReadMode) {
      // Only pre-encryption-key metadata and encrypted event payloads. Never forward OAuth credentials.
      if (input.resource === "recovery_status") {
        return NextResponse.json({
          ok: true,
          resource: "recovery_status",
          data: {
            has_public_key_record: result.data?.has_public_key_record === true,
            has_backup_config: result.data?.has_backup_config === true,
            has_embedded_realm_tokens: result.data?.has_embedded_realm_tokens === true,
            realm_auth_ready: false,
            pin_unlock_ready: false,
          },
        }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ ok: true, resource: result.resource, account_id: result.account_id, data: result.data, meta: result.meta, errors: result.errors }, { headers: { "Cache-Control": "no-store" } });
    }
    if (chatKeyStatusMode) {
      return NextResponse.json({ ok: true, mode: "chat_key_status", accounts_checked: Number(result.accounts_checked ?? 0), registered: Number(result.registered ?? 0), unregistered: Number(result.unregistered ?? 0) });
    }
    if (chatStatusMode) {
      return NextResponse.json({
        ok: true,
        mode: "chat_status",
        accounts_checked: Number(result.accounts_checked ?? 0),
        conversations_on_first_pages: Number(result.conversations_on_first_pages ?? 0),
        has_more: result.has_more === true,
      });
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
