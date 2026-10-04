import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getProviderConfig } from "../../../../../lib/integrations/oauth/providers";
import { createClient } from "../../../../../lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claims?.claims?.sub === "string"
        ? claims.claims.sub
        : null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .limit(1);

    if (
      membershipError ||
      !Array.isArray(memberships) ||
      memberships.length !== 1 ||
      memberships[0].role !== "owner"
    ) {
      return NextResponse.json(
        { ok: false, message: "Instagram受信設定は管理者のみ確認できます。" },
        { status: 403 },
      );
    }

    const origin = new URL(request.url).origin;
    const config = getProviderConfig("instagram", origin);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";

    if (!config || !supabaseUrl) {
      return NextResponse.json(
        { ok: false, message: "Instagram OAuth設定がまだ完了していません。" },
        { status: 409 },
      );
    }

    const verifyToken = createHash("sha256")
      .update("omnibox-instagram-webhook:" + config.clientSecret)
      .digest("hex")
      .slice(0, 40);

    return NextResponse.json({
      ok: true,
      webhookUrl: new URL(
        "/functions/v1/omnibox-instagram-webhook",
        supabaseUrl,
      ).toString(),
      verifyToken,
      subscribedFields: ["messages"],
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Instagram受信設定を確認できませんでした。" },
      { status: 500 },
    );
  }
}
