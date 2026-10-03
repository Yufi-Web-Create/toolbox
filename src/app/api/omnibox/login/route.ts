import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !EMAIL_PATTERN.test(email) || !password) {
      return NextResponse.json(
        { ok: false, message: "メールアドレスまたはパスワードを確認してください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, message: "メールアドレスまたはパスワードが正しくありません。" },
        { status: 401 },
      );
    }

    const name =
      typeof data.user.user_metadata?.full_name === "string" &&
      data.user.user_metadata.full_name.trim()
        ? data.user.user_metadata.full_name.trim()
        : data.user.email?.split("@")[0] || "スタッフ";

    return NextResponse.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        name,
        role: "スタッフ",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "ログインできませんでした。もう一度お試しください。" },
      { status: 500 },
    );
  }
}
