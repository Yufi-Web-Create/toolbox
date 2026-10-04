import { NextResponse } from "next/server";

import { getSupabaseConfig } from "../../../../../lib/supabase/config";
import { createClient } from "../../../../../lib/supabase/server";

async function authorizeOwner() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId =
    !claimsError && typeof claims?.claims?.sub === "string"
      ? claims.claims.sub
      : null;

  if (!userId) {
    return {
      error: NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      ),
    };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1);

  const membership =
    !membershipError && Array.isArray(memberships) && memberships.length === 1
      ? memberships[0]
      : null;

  if (!membership || membership.role !== "owner") {
    return {
      error: NextResponse.json(
        { ok: false, message: "Instagram受信設定は管理者のみ変更できます。" },
        { status: 403 },
      ),
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      error: NextResponse.json(
        { ok: false, message: "ログインセッションを確認できませんでした。" },
        { status: 401 },
      ),
    };
  }

  return {
    supabase,
    accessToken: session.access_token,
    organizationId: membership.organization_id as string,
  };
}

async function runSubscriptionAction(
  action: "status" | "subscribe",
  connectionId: string,
) {
  const auth = await authorizeOwner();
  if ("error" in auth) return auth.error;

  const { url, publishableKey } = getSupabaseConfig();

  const { data: connections, error: connectionError } = await auth.supabase
    .from("provider_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("organization_id", auth.organizationId)
    .eq("provider", "instagram")
    .limit(1);

  if (
    connectionError ||
    !Array.isArray(connections) ||
    connections.length !== 1
  ) {
    return NextResponse.json(
      { ok: false, message: "Instagram接続が見つかりません。" },
      { status: 404 },
    );
  }

  const response = await fetch(
    new URL("/functions/v1/omnibox-instagram-subscription", url),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, connectionId }),
      cache: "no-store",
    },
  );

  const result = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || !result) {
    const error =
      result?.error && typeof result.error === "object"
        ? (result.error as Record<string, unknown>)
        : null;
    return NextResponse.json(
      {
        ok: false,
        message:
          typeof error?.message === "string"
            ? error.message
            : "Instagram Webhook購読状態を更新できませんでした。",
      },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }

  return NextResponse.json({
    ok: result.ok === true,
    success: result.success === true,
    subscribedFields: Array.isArray(result.subscribedFields)
      ? result.subscribedFields
      : [],
    messagesSubscribed: result.messagesSubscribed === true,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connectionId")?.trim() ?? "";

  if (!connectionId) {
    return NextResponse.json(
      { ok: false, message: "Instagram接続を指定してください。" },
      { status: 400 },
    );
  }

  return runSubscriptionAction("status", connectionId);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "リクエストを確認してください。" },
      { status: 400 },
    );
  }

  const connectionId =
    typeof body.connectionId === "string" ? body.connectionId.trim() : "";

  if (!connectionId) {
    return NextResponse.json(
      { ok: false, message: "Instagram接続を指定してください。" },
      { status: 400 },
    );
  }

  return runSubscriptionAction("subscribe", connectionId);
}
