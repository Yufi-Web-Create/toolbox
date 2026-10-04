import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

function syncUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-x-sync", base) : null;
}

export async function POST() {
  try {
    const endpoint = syncUrl();
    if (!endpoint) {
      return NextResponse.json(
        { ok: false, message: "X DM同期を開始できませんでした。" },
        { status: 500 },
      );
    }

    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claims?.claims?.sub !== "string") {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      return NextResponse.json(
        { ok: false, message: "XのDMを同期できませんでした。" },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      accounts: Number(result.accounts ?? 0),
      imported: Number(result.imported ?? 0),
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "XのDMを同期できませんでした。" },
      { status: 500 },
    );
  }
}
