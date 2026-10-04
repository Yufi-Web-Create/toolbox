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


export async function PATCH(request: Request) {
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
    const body = await request.json();
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_required" },
        { status: 400 },
      );
    }

    if (typeof body?.status === "string") {
      const status =
        body.status === "resolved"
          ? "completed"
          : body.status === "unread" || body.status === "in_progress"
            ? body.status
            : null;

      if (!status) {
        return NextResponse.json(
          { ok: false, error: "invalid_status" },
          { status: 400 },
        );
      }
      updates.status = status;
    }

    if ("assigneeUserId" in body) {
      const assigneeUserId =
        typeof body.assigneeUserId === "string" && body.assigneeUserId.trim()
          ? body.assigneeUserId.trim()
          : null;

      if (assigneeUserId) {
        const { data: assigneeMemberships, error: assigneeError } = await supabase
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", organizationId)
          .eq("user_id", assigneeUserId)
          .limit(1);

        if (
          assigneeError ||
          !Array.isArray(assigneeMemberships) ||
          assigneeMemberships.length !== 1
        ) {
          return NextResponse.json(
            { ok: false, error: "invalid_assignee" },
            { status: 400 },
          );
        }
      }

      updates.assignee_user_id = assigneeUserId;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { ok: false, error: "no_changes" },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: "conversation_update_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "conversation_update_failed" },
      { status: 500 },
    );
  }
}
