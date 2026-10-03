import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

const ORGANIZATION_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const loginId =
      typeof payload?.loginId === "string"
        ? payload.loginId.trim().toUpperCase()
        : "";

    if (!name || name.length > 120) {
      return NextResponse.json(
        { ok: false, message: "組織名を1〜120文字で入力してください。" },
        { status: 400 },
      );
    }

    if (!ORGANIZATION_ID_PATTERN.test(loginId)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "組織IDは3〜32文字の半角英数字・ハイフン・アンダースコアで入力してください。",
        },
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
      .update({ name, login_id: loginId })
      .eq("id", membership.organization_id)
      .select("id, name, login_id")
      .single();

    if (error || !data) {
      const duplicate =
        typeof error?.code === "string" && error.code === "23505";
      return NextResponse.json(
        {
          ok: false,
          message: duplicate
            ? "その組織IDはすでに使用されています。別の組織IDを設定してください。"
            : "組織設定を更新できませんでした。",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      organization: {
        id: data.id,
        name: data.name,
        loginId: data.login_id,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "組織設定を更新できませんでした。" },
      { status: 500 },
    );
  }
}
