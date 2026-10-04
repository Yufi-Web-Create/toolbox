import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

function edgeUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return base ? new URL("/functions/v1/omnibox-demo-session", base) : null;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const role = payload?.role === "staff" ? "staff" : "admin";
    const endpoint = edgeUrl();

    if (!endpoint) {
      return NextResponse.json(
        { ok: false, message: "デモ環境を開始できませんでした。" },
        { status: 500 },
      );
    }

    const edgeResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
      cache: "no-store",
    });

    const edgeResult = await edgeResponse.json();

    if (
      !edgeResponse.ok ||
      edgeResult.ok !== true ||
      typeof edgeResult.tokenHash !== "string"
    ) {
      return NextResponse.json(
        { ok: false, message: "デモ環境を開始できませんでした。" },
        { status: 500 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: edgeResult.tokenHash,
      type: "magiclink",
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, message: "デモ環境へログインできませんでした。" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "デモ環境へログインできませんでした。" },
      { status: 500 },
    );
  }
}
