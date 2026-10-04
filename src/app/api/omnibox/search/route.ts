import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claims?.claims?.sub === "string"
        ? claims.claims.sub
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
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return NextResponse.json({ ok: true, conversationIds: [] });
    }

    if (q.length > 100) {
      return NextResponse.json(
        { ok: false, message: "検索文字列が長すぎます。" },
        { status: 400 },
      );
    }

    const escaped = q.replace(/[%,]/g, (value) => "\" + value);
    const pattern = `%${escaped}%`;

    const [conversationResult, messageResult, noteResult] = await Promise.all([
      supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", organizationId)
        .or(
          `customer_display_name.ilike.${pattern},last_message_preview.ilike.${pattern},provider_thread_id.ilike.${pattern}`,
        )
        .limit(200),
      supabase
        .from("messages")
        .select("conversation_id")
        .eq("organization_id", organizationId)
        .ilike("body", pattern)
        .limit(500),
      supabase
        .from("internal_notes")
        .select("conversation_id")
        .eq("organization_id", organizationId)
        .ilike("body", pattern)
        .limit(500),
    ]);

    if (
      conversationResult.error ||
      messageResult.error ||
      noteResult.error
    ) {
      return NextResponse.json(
        { ok: false, message: "検索できませんでした。" },
        { status: 500 },
      );
    }

    const ids = new Set<string>();
    for (const row of conversationResult.data ?? []) ids.add(row.id);
    for (const row of messageResult.data ?? []) ids.add(row.conversation_id);
    for (const row of noteResult.data ?? []) ids.add(row.conversation_id);

    return NextResponse.json({
      ok: true,
      conversationIds: [...ids],
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "検索できませんでした。" },
      { status: 500 },
    );
  }
}
