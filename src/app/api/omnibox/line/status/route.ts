import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claimsData?.claims?.sub === "string"
        ? claimsData.claims.sub
        : null;

    if (!userId) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1);

    if (
      membershipError ||
      !Array.isArray(memberships) ||
      memberships.length !== 1
    ) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const organizationId = memberships[0].organization_id;
    const bridgeKey = process.env.OMNIBOX_PROVIDER_BRIDGE_KEY?.trim() ?? "";

    if (!bridgeKey) {
      return NextResponse.json({
        ok: false,
        bridgeReady: false,
        lineConnected: false,
      });
    }

    const response = await fetch(
      new URL("/internal/operator/line/status", BRIDGE_URL),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-omnibox-provider-key": bridgeKey,
        },
        body: JSON.stringify({ organizationId }),
        cache: "no-store",
      },
    );

    const result = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok || result.ok !== true) {
      return NextResponse.json({
        ok: false,
        bridgeReady: false,
        lineConnected: false,
      });
    }

    return NextResponse.json({
      ok: true,
      bridgeReady: result.bridgeReady === true,
      lineConnected: result.lineConnected === true,
      lineApiReachable: result.lineApiReachable === true,
      webhookActive: result.webhookActive === true,
      webhookMatches: result.webhookMatches === true,
      webhookUrl:
        typeof result.webhookUrl === "string" ? result.webhookUrl : null,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      bridgeReady: false,
      lineConnected: false,
    });
  }
}
