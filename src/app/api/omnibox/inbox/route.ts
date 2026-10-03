import { NextResponse } from "next/server";

import { getInboxSnapshot } from "../../../../lib/inbox/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const userId =
      !error && typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
      return NextResponse.json(
        { ok: false, error: "organization_membership_required" },
        { status: 403 },
      );
    }

    const organizationId = memberships[0].organization_id;
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversation");
    const inbox = await getInboxSnapshot(organizationId, conversationId);

    if (!inbox.success) {
      return NextResponse.json({ ok: false, error: "inbox_unavailable" }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      conversations: inbox.conversations,
      messages: inbox.messages,
      selectedConversation: inbox.selectedConversation,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "inbox_unavailable" }, { status: 503 });
  }
}
