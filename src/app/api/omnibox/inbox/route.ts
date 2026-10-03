import { NextResponse } from "next/server";

import { getInboxSnapshot } from "../../../../lib/inbox/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversation");
    const inbox = await getInboxSnapshot(conversationId);

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
