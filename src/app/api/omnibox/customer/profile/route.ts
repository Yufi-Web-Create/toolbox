import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const conversationId =
      typeof payload?.conversationId === "string" ? payload.conversationId.trim() : "";

    if (!conversationId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claimsData?.claims?.sub !== "string") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? "";

    if (!accessToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const response = await fetch(new URL("/internal/line/profile", BRIDGE_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId }),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      return NextResponse.json({ ok: false }, { status: response.status });
    }

    return NextResponse.json({
      ok: true,
      customerDisplayName: result.customerDisplayName ?? null,
      customerAvatarUrl: result.customerAvatarUrl ?? null,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
