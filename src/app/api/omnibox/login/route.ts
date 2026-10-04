import { NextResponse } from "next/server";

import {
  internalEmailForLoginId,
  isValidLoginId,
  normalizeLoginId,
} from "../../../../lib/login-id";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = normalizeLoginId(
      typeof body?.loginId === "string" ? body.loginId : "",
    );
    const password = typeof body?.password === "string" ? body.password : "";
    const loginType = body?.loginType === "employee" ? "employee" : "admin";

    if (!isValidLoginId(loginId) || !password) {
      return NextResponse.json(
        { ok: false, message: "IDまたはパスワードを確認してください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: internalEmailForLoginId(loginId),
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, message: "ログイン情報が正しくありません。" },
        { status: 401 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", data.user.id)
      .limit(1);

    const membership =
      !membershipError && Array.isArray(memberships) && memberships.length === 1
        ? memberships[0]
        : null;

    const accountType =
      typeof data.user.user_metadata?.account_type === "string"
        ? data.user.user_metadata.account_type
        : "member";
    const roleKey = membership?.role ?? accountType;
    const actualLoginType = roleKey === "member" ? "employee" : "admin";

    if (
      (!membership && roleKey !== "owner") ||
      actualLoginType !== loginType
    ) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          ok: false,
          message:
            actualLoginType !== loginType
              ? "選択したログイン種別とアカウント種別が一致しません。"
              : "所属組織を確認できませんでした。",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      ok: true,
      roleKey,
      loginType: actualLoginType,
      loginId,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "ログインできませんでした。もう一度お試しください。" },
      { status: 500 },
    );
  }
}
