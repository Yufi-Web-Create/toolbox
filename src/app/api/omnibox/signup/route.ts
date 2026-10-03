import { NextResponse } from "next/server";

import { getAppOrigin } from "../../../../lib/app-url";
import { createClient } from "../../../../lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name) {
      return NextResponse.json(
        { ok: false, message: "お名前を入力してください。" },
        { status: 400 },
      );
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { ok: false, message: "有効なメールアドレスを入力してください。" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, message: "パスワードは8文字以上で入力してください。" },
        { status: 400 },
      );
    }

    const appOrigin = getAppOrigin();
    if (!appOrigin) {
      return NextResponse.json(
        { ok: false, message: "アカウントを作成できませんでした。" },
        { status: 500 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, account_type: "owner" },
        emailRedirectTo: `${appOrigin}/auth/callback?next=/omnibox.html`,
      },
    });

    if (error) {
      return NextResponse.json(
        { ok: false, message: "アカウントを作成できませんでした。入力内容をご確認ください。" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。",
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "アカウントを作成できませんでした。" },
      { status: 500 },
    );
  }
}
