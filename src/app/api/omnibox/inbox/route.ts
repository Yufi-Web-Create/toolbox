import { NextResponse } from "next/server";

import { getInboxSnapshot } from "../../../../lib/inbox/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const inbox = await getInboxSnapshot();

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
