import { NextResponse } from "next/server";

import { isPlanKey, PLAN_DEFINITIONS } from "../../../../lib/plans";
import { createClient } from "../../../../lib/supabase/server";

function publisherUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-provider-publish", base) : null;
}

async function authContext() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId =
    !claimsError && typeof claims?.claims?.sub === "string"
      ? claims.claims.sub
      : null;

  if (!userId) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1);

  const organizationId =
    !membershipError &&
    Array.isArray(memberships) &&
    memberships.length === 1
      ? memberships[0].organization_id
      : null;

  if (!organizationId) return null;

  const { data: organization } = await supabase
    .from("organizations")
    .select("plan_key")
    .eq("id", organizationId)
    .maybeSingle();
  const plan = isPlanKey(organization?.plan_key)
    ? organization.plan_key
    : "standard";

  const { data: sessionData } = await supabase.auth.getSession();

  return {
    supabase,
    userId,
    organizationId,
    plan,
    accessToken: sessionData.session?.access_token ?? "",
  };
}

export async function GET() {
  try {
    const ctx = await authContext();
    if (!ctx) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    if (!PLAN_DEFINITIONS[ctx.plan].socialPublishing) {
      return NextResponse.json(
        { ok: false, message: "SNS投稿はスタンダード以上のプランで利用できます。" },
        { status: 403 },
      );
    }

    const { data, error } = await ctx.supabase
      .from("social_posts")
      .select(
        "id, content, x_content, media_url, media_urls, target_connection_ids, scheduled_at, status, results, last_error, created_at, published_at",
      )
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !Array.isArray(data)) {
      return NextResponse.json(
        { ok: false, message: "投稿一覧を読み込めませんでした。" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, posts: data });
  } catch {
    return NextResponse.json(
      { ok: false, message: "投稿一覧を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await authContext();
    if (!ctx) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    if (!PLAN_DEFINITIONS[ctx.plan].socialPublishing) {
      return NextResponse.json(
        { ok: false, message: "SNS投稿はスタンダード以上のプランで利用できます。" },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const content =
      typeof payload?.content === "string" ? payload.content.trim() : "";
    const xContent = typeof payload?.xContent === "string" ? payload.xContent.trim() : "";
    const mediaUrls = Array.isArray(payload?.mediaUrls)
      ? [...new Set(
          payload.mediaUrls
            .filter((value: unknown) => typeof value === "string")
            .map((value: string) => value.trim())
            .filter(Boolean),
        )].slice(0, 10)
      : typeof payload?.mediaUrl === "string" && payload.mediaUrl.trim()
        ? [payload.mediaUrl.trim()]
        : [];
    const mediaUrl = mediaUrls[0] ?? "";
    const targetConnectionIds = Array.isArray(payload?.targetConnectionIds)
      ? [...new Set(
          payload.targetConnectionIds
            .filter((value: unknown) => typeof value === "string")
            .map((value: string) => value.trim())
            .filter(Boolean),
        )]
      : [];
    const timing = payload?.timing === "now" ? "now" : "schedule";
    const scheduledAt =
      typeof payload?.scheduledAt === "string" && payload.scheduledAt
        ? payload.scheduledAt
        : null;

    if (
      !content ||
      content.length > 5000 ||
      targetConnectionIds.length === 0 ||
      targetConnectionIds.length > 20
    ) {
      return NextResponse.json(
        { ok: false, message: "投稿内容と投稿先を確認してください。" },
        { status: 400 },
      );
    }

    if (timing === "schedule") {
      if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
        return NextResponse.json(
          { ok: false, message: "予約日時を確認してください。" },
          { status: 400 },
        );
      }
      if (Date.parse(scheduledAt) <= Date.now() + 60_000) {
        return NextResponse.json(
          { ok: false, message: "予約日時は現在より1分以上先を指定してください。" },
          { status: 400 },
        );
      }
    }

    const { data: connections, error: connectionsError } = await ctx.supabase.rpc(
      "omnibox_list_provider_connections",
    );

    if (connectionsError || !Array.isArray(connections)) {
      return NextResponse.json(
        { ok: false, message: "投稿先アカウントを確認できませんでした。" },
        { status: 500 },
      );
    }

    const selected = connections.filter((connection) =>
      targetConnectionIds.includes(connection.id),
    );

    if (
      selected.length !== targetConnectionIds.length ||
      selected.some(
        (connection) =>
          connection.status !== "active" ||
          !["x", "instagram"].includes(connection.provider),
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "現在、実投稿に対応しているのはXとInstagramです。" },
        { status: 400 },
      );
    }

    const includesInstagram = selected.some(
      (connection) => connection.provider === "instagram",
    );
    const includesX = selected.some((connection) => connection.provider === "x");

    if (includesInstagram && mediaUrls.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Instagram投稿には画像が必要です。" },
        { status: 400 },
      );
    }

    if (includesInstagram && mediaUrls.length > 10) {
      return NextResponse.json(
        { ok: false, message: "Instagram投稿の画像は10枚までです。" },
        { status: 400 },
      );
    }

    if (includesX && (!xContent || xContent.length > 5000)) {
      return NextResponse.json({ ok: false, message: "X用の投稿本文を入力してください。" }, { status: 400 });
    }

    if (includesX && mediaUrls.length > 4) {
      return NextResponse.json(
        { ok: false, message: "X投稿の画像は4枚までです。" },
        { status: 400 },
      );
    }

    const { data: post, error: insertError } = await ctx.supabase
      .from("social_posts")
      .insert({
        organization_id: ctx.organizationId,
        created_by: ctx.userId,
        content,
        x_content: includesX ? xContent : null,
        media_url: mediaUrl || null,
        media_urls: mediaUrls,
        target_connection_ids: targetConnectionIds,
        scheduled_at:
          timing === "schedule" ? new Date(scheduledAt!).toISOString() : null,
        status: timing === "schedule" ? "scheduled" : "publishing",
      })
      .select(
        "id, content, x_content, media_url, media_urls, target_connection_ids, scheduled_at, status, results, last_error, created_at, published_at",
      )
      .single();

    if (insertError || !post) {
      return NextResponse.json(
        { ok: false, message: "投稿を保存できませんでした。" },
        { status: 500 },
      );
    }

    if (timing === "schedule") {
      return NextResponse.json({
        ok: true,
        post,
        executionPending: true,
      });
    }

    const endpoint = publisherUrl();
    if (!endpoint || !ctx.accessToken) {
      return NextResponse.json(
        { ok: false, message: "投稿サービスを開始できませんでした。" },
        { status: 500 },
      );
    }

    const publishResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId: post.id }),
      cache: "no-store",
    });

    const publishResult = await publishResponse.json().catch(() => ({}));

    const { data: refreshed } = await ctx.supabase
      .from("social_posts")
      .select(
        "id, content, x_content, media_url, media_urls, target_connection_ids, scheduled_at, status, results, last_error, created_at, published_at",
      )
      .eq("id", post.id)
      .maybeSingle();

    if (!publishResponse.ok || publishResult.status === "failed") {
      return NextResponse.json(
        {
          ok: false,
          message: "一部またはすべてのSNSへ投稿できませんでした。",
          post: refreshed ?? post,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: publishResult.status === "published",
      partial: publishResult.status === "partial_failed",
      post: refreshed ?? post,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "投稿処理に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await authContext();
    if (!ctx) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    if (!PLAN_DEFINITIONS[ctx.plan].socialPublishing) {
      return NextResponse.json(
        { ok: false, message: "SNS投稿はスタンダード以上のプランで利用できます。" },
        { status: 403 },
      );
    }

    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        { ok: false, message: "投稿を確認できません。" },
        { status: 400 },
      );
    }

    const { data, error } = await ctx.supabase
      .from("social_posts")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "予約投稿を取り消せませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "予約投稿を取り消せませんでした。" },
      { status: 500 },
    );
  }
}
