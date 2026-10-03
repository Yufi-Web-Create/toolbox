import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

const DEFAULT_TEMPLATES = [
  {
    category: "salon",
    title: "ご予約の確定案内（日時・アクセス）",
    body: "ご予約誠にありがとうございます！以下の日時でご案内確定いたしました。\n\n■ご予約日時: [日時を入力]\n■施術内容: [メニュー名]\n\n当日はお気をつけてお越しくださいませ。道に迷われた際はお気軽にお電話ください。",
  },
  {
    category: "salon",
    title: "予約満席時の別日程ご案内",
    body: "お問い合わせありがとうございます。大変申し訳ございませんが、ご希望いただいたお時間は既に満席となっております。\n\n以下の日時であればすぐにご案内可能ですが、ご都合いかがでしょうか？\n・[候補日時1]\n・[候補日時2]",
  },
  {
    category: "restaurant",
    title: "宴会・団体予約のお席確認",
    body: "お問い合わせいただきありがとうございます！[人数]名様のご予約可能でございます。アレルギーやお苦手な食材などがございましたら事前に気兼ねなくお申し付けくださいませ。",
  },
  {
    category: "ec",
    title: "商品の在庫確認・取り置き完了",
    body: "お問い合わせありがとうございます！お問い合わせいただいた商品（サイズ/カラー）につきまして、店舗に残り[点数]点在庫がございます。お取り置きも承れますので、ご希望の際はお知らせください。",
  },
  {
    category: "business",
    title: "資料送付とお打ち合わせの御礼",
    body: "お問い合わせいただき誠にありがとうございます。ご要望のサービス資料を添付にて送付いたします。\nオンラインでのデモやお見積もりの作成も可能ですので、ご不明点等ございましたらお気軽にご相談ください。",
  },
];

async function context() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId =
    !claimsError && typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (!userId) return null;

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1);

  if (error || !Array.isArray(memberships) || memberships.length !== 1) {
    return null;
  }

  return { supabase, userId, organizationId: memberships[0].organization_id };
}

export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

    const { data: initialData, error } = await ctx.supabase
      .from("reply_templates")
      .select("id, title, category, body, created_at")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, message: "定型文を読み込めませんでした。" },
        { status: 500 },
      );
    }

    let data = initialData;

    if (!data || data.length === 0) {
      const rows = DEFAULT_TEMPLATES.map((template) => ({
        ...template,
        organization_id: ctx.organizationId,
        created_by: ctx.userId,
      }));
      const seeded = await ctx.supabase
        .from("reply_templates")
        .insert(rows)
        .select("id, title, category, body, created_at");

      if (!seeded.error && seeded.data) {
        data = seeded.data;
      }
    }

    return NextResponse.json({ ok: true, templates: data ?? [] });
  } catch {
    return NextResponse.json(
      { ok: false, message: "定型文を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) {
      return NextResponse.json({ ok: false, message: "ログインが必要です。" }, { status: 401 });
    }

    const payload = await request.json();
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    const category =
      typeof payload?.category === "string" && payload.category.trim()
        ? payload.category.trim()
        : "general";
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";

    if (!title || title.length > 100 || !body || body.length > 5000) {
      return NextResponse.json(
        { ok: false, message: "タイトルと本文を確認してください。" },
        { status: 400 },
      );
    }

    const { data, error } = await ctx.supabase
      .from("reply_templates")
      .insert({
        organization_id: ctx.organizationId,
        created_by: ctx.userId,
        title,
        category,
        body,
      })
      .select("id, title, category, body, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "定型文を登録できませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, template: data });
  } catch {
    return NextResponse.json(
      { ok: false, message: "定型文を登録できませんでした。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) {
      return NextResponse.json({ ok: false, message: "ログインが必要です。" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ ok: false, message: "定型文を確認できません。" }, { status: 400 });
    }

    const { error } = await ctx.supabase
      .from("reply_templates")
      .delete()
      .eq("id", id)
      .eq("organization_id", ctx.organizationId);

    if (error) {
      return NextResponse.json(
        { ok: false, message: "定型文を削除できませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "定型文を削除できませんでした。" },
      { status: 500 },
    );
  }
}
