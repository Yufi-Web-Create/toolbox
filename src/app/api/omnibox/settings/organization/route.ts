import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";

    if (!name || name.length > 120) {
      return NextResponse.json(
        { ok: false, message: "組織名を1〜120文字で入力してください。" },
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
      .select("organization_id, role")
      .eq("user_id", userId)
      .limit(1);

    const membership =
      !membershipError && Array.isArray(memberships) && memberships.length === 1
        ? memberships[0]
        : null;

    if (!membership || membership.role !== "owner") {
      return NextResponse.json(
        { ok: false, message: "組織設定は管理者のみ変更できます。" },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("organizations")
      .update({ name })
      .eq("id", membership.organization_id)
      .select("id, name")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "組織設定を更新できませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, organization: data });
  } catch {
    return NextResponse.json(
      { ok: false, message: "組織設定を更新できませんでした。" },
      { status: 500 },
    );
  }
}
