import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

function edgeUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-admin-employees", base) : null;
}

async function accessToken() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || typeof claimsData?.claims?.sub !== "string") {
    return null;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

export async function GET() {
  try {
    const endpoint = edgeUrl();
    const token = await accessToken();

    if (!endpoint || !token) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      return NextResponse.json(
        { ok: false, message: "従業員一覧を読み込めませんでした。" },
        { status: response.status === 403 ? 403 : 500 },
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, message: "従業員一覧を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const endpoint = edgeUrl();
    const token = await accessToken();

    if (!endpoint || !token) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const payload = await request.json();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      const code = typeof result.error === "string" ? result.error : "";
      const message =
        code === "email_already_exists"
          ? "そのメールアドレスはすでに使用されています。"
          : code === "owner_required"
            ? "従業員アカウントの作成は管理者のみ行えます。"
            : "従業員アカウントを作成できませんでした。";

      return NextResponse.json(
        { ok: false, message },
        { status: response.status >= 400 && response.status < 500 ? response.status : 500 },
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, message: "従業員アカウントを作成できませんでした。" },
      { status: 500 },
    );
  }
}
