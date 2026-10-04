import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = !userError ? userData.user : null;

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const payload = await request.json();
    const conversationId =
      typeof payload?.conversationId === "string"
        ? payload.conversationId.trim()
        : "";
    const body =
      typeof payload?.body === "string" ? payload.body.trim() : "";

    if (!conversationId || !body || body.length > 5000) {
      return NextResponse.json(
        { ok: false, message: "社内メモの内容を確認してください。" },
        { status: 400 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1);

    const organizationId =
      !membershipError &&
      Array.isArray(memberships) &&
      memberships.length === 1
        ? memberships[0].organization_id
        : null;

    if (!organizationId) {
      return NextResponse.json(
        { ok: false, message: "所属組織を確認できませんでした。" },
        { status: 403 },
      );
    }

    const { data: conversations, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .limit(1);

    if (
      conversationError ||
      !Array.isArray(conversations) ||
      conversations.length !== 1
    ) {
      return NextResponse.json(
        { ok: false, message: "対象の会話を確認できませんでした。" },
        { status: 404 },
      );
    }

    const metadata = user.user_metadata ?? {};
    const authorName =
      typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : "スタッフ";

    const { data: note, error: insertError } = await supabase
      .from("internal_notes")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        created_by: user.id,
        author_name: authorName,
        body,
      })
      .select("id, author_name, body, created_at")
      .single();

    if (insertError || !note) {
      return NextResponse.json(
        { ok: false, message: "社内メモを保存できませんでした。" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, note });
  } catch {
    return NextResponse.json(
      { ok: false, message: "社内メモを保存できませんでした。" },
      { status: 500 },
    );
  }
}
