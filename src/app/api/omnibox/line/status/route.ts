import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const response = await fetch(new URL("/health", BRIDGE_URL), {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        bridgeReady: false,
        lineConnected: false,
      });
    }

    const health = (await response.json()) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      bridgeReady: health.configured === true,
      lineConnected: health.lineConnected === true,
      lineApiReachable: health.lineApiReachable === true,
      webhookActive: health.webhookActive === true,
      webhookMatches: health.webhookMatches === true,
      webhookUrl:
        typeof health.webhookUrl === "string" ? health.webhookUrl : null,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      bridgeReady: false,
      lineConnected: false,
    });
  }
}
