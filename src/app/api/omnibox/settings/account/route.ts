import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const password =
      typeof payload?.password === "string" ? payload.password : "";
    const currentPassword =
      typeof payload?.currentPassword === "string" ? payload.currentPassword : "";

    if (!name || name.length > 100) {
      return NextResponse.json(
        { ok: false, message: "表示名を1〜100文字で入力してください。" },
        { status: 400 },
      );
    }

    if (password && password.length < 8) {
      return NextResponse.json(
        { ok: false, message: "新しいパスワードは8文字以上で入力してください。" },
        { status: 400 },
      );
    }

    if (password && !currentPassword) {
      return NextResponse.json(
        { ok: false, message: "パスワード変更には現在のパスワードが必要です。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claimsData?.claims?.sub !== "string") {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    if (password) {
      const email =
        typeof claimsData.claims.email === "string" ? claimsData.claims.email : "";
      if (!email) {
        return NextResponse.json(
          { ok: false, message: "現在のログイン情報を確認できませんでした。" },
          { status: 400 },
        );
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verifyError) {
        return NextResponse.json(
          { ok: false, message: "現在のパスワードが正しくありません。" },
          { status: 401 },
        );
      }
    }

    const update: {
      data: { full_name: string };
      password?: string;
    } = {
      data: { full_name: name },
    };

    if (password) {
      update.password = password;
    }

    const { error } = await supabase.auth.updateUser(update);

    if (error) {
      return NextResponse.json(
        { ok: false, message: "アカウント設定を更新できませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json(
      { ok: false, message: "アカウント設定を更新できませんでした。" },
      { status: 500 },
    );
  }
}
