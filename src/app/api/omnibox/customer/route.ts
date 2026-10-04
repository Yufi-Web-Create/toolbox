import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const conversationId =
      typeof payload?.conversationId === "string" ? payload.conversationId.trim() : "";
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";

    if (!conversationId || !name || name.length > 100) {
      return NextResponse.json(
        { ok: false, message: "名前を1〜100文字で入力してください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claims?.claims?.sub === "string"
        ? claims.claims.sub
        : null;

    if (!userId) {
      return NextResponse.json({ ok: false, message: "ログインが必要です。" }, { status: 401 });
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1);

    const organizationId =
      !membershipError && Array.isArray(memberships) && memberships.length === 1
        ? memberships[0].organization_id
        : null;

    if (!organizationId) {
      return NextResponse.json({ ok: false, message: "所属組織を確認できません。" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .update({
        customer_display_name: name,
        customer_name_source: "custom",
      })
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .select("id, customer_display_name")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "お客様名を変更できませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, name: data.customer_display_name });
  } catch {
    return NextResponse.json(
      { ok: false, message: "お客様名を変更できませんでした。" },
      { status: 500 },
    );
  }
}
