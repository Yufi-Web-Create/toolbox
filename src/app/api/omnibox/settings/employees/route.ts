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

async function forward(method: "GET" | "POST" | "PATCH" | "DELETE", payload?: unknown) {
  const endpoint = edgeUrl();
  const token = await accessToken();

  if (!endpoint || !token) {
    return NextResponse.json(
      { ok: false, message: "ログインが必要です。" },
      { status: 401 },
    );
  }

  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store",
  });

  let result: Record<string, unknown> = {};
  try {
    result = await response.json();
  } catch {}

  if (!response.ok || result.ok !== true) {
    const code = typeof result.error === "string" ? result.error : "";
    const message =
      code === "email_already_exists"
        ? "そのメールアドレスはすでに使用されています。"
        : code === "owner_required"
          ? "従業員アカウントの管理は管理者のみ行えます。"
          : code === "plan_user_limit_reached"
            ? "ライトプランは管理者を含め3名まで利用できます。上位プランへ変更してください。"
          : code === "invalid_password"
            ? "パスワードは8文字以上で入力してください。"
            : code === "employee_not_found"
              ? "従業員アカウントを確認できませんでした。"
              : method === "GET"
                ? "従業員一覧を読み込めませんでした。"
                : method === "DELETE"
                  ? "従業員アカウントを削除できませんでした。"
                  : method === "PATCH"
                    ? "従業員アカウントを更新できませんでした。"
                    : "従業員アカウントを作成できませんでした。";

    return NextResponse.json(
      { ok: false, message },
      { status: response.status >= 400 && response.status < 500 ? response.status : 500 },
    );
  }

  return NextResponse.json(result);
}

export async function GET() {
  try {
    return await forward("GET");
  } catch {
    return NextResponse.json(
      { ok: false, message: "従業員一覧を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    return await forward("POST", await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, message: "従業員アカウントを作成できませんでした。" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    return await forward("PATCH", await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, message: "従業員アカウントを更新できませんでした。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    return await forward("DELETE", await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, message: "従業員アカウントを削除できませんでした。" },
      { status: 500 },
    );
  }
}
