import { NextResponse } from "next/server";

import {
  isValidLoginId,
  normalizeLoginId,
} from "../../../../lib/login-id";

function edgeUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-id-signup", base) : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const loginId = normalizeLoginId(
      typeof body?.loginId === "string" ? body.loginId : "",
    );
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name) {
      return NextResponse.json(
        { ok: false, message: "お名前を入力してください。" },
        { status: 400 },
      );
    }

    if (!isValidLoginId(loginId)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "IDは3〜32文字の半角英数字・ピリオド・ハイフン・アンダースコアで入力してください。",
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, message: "パスワードは8文字以上で入力してください。" },
        { status: 400 },
      );
    }

    const endpoint = edgeUrl();
    if (!endpoint) {
      return NextResponse.json(
        { ok: false, message: "アカウントを作成できませんでした。" },
        { status: 500 },
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, loginId, password }),
      cache: "no-store",
    });

    const result = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok || result.ok !== true) {
      const code = typeof result.error === "string" ? result.error : "";
      const message =
        code === "login_id_taken"
          ? "そのIDはすでに使用されています。別のIDを入力してください。"
          : code === "invalid_account"
            ? "入力内容をご確認ください。"
            : "アカウントを作成できませんでした。";

      return NextResponse.json(
        { ok: false, message },
        { status: code === "login_id_taken" ? 409 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "管理者アカウントを作成しました。IDとパスワードでログインできます。",
      loginId,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "アカウントを作成できませんでした。" },
      { status: 500 },
    );
  }
}
