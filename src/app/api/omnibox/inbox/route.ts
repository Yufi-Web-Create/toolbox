import { NextResponse } from "next/server";

import { getInboxSnapshot } from "../../../../lib/inbox/server";
import { isPlanKey, planAllowsProvider } from "../../../../lib/plans";
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
    const { data: organization } = await supabase
      .from("organizations")
      .select("plan_key")
      .eq("id", organizationId)
      .maybeSingle();
    const plan = isPlanKey(organization?.plan_key)
      ? organization.plan_key
      : "standard";

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversation");
    const detailOnly = url.searchParams.get("detail") === "1";

    if (conversationId && detailOnly) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select(
          "id, organization_id, provider, provider_connection_id, provider_thread_id, customer_external_id, customer_display_name, customer_avatar_url, provider_metadata, customer_name_source, assignee_user_id, status, last_message_preview, last_message_at, created_at, updated_at",
        )
        .eq("id", conversationId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (conversationError || !conversation) {
        return NextResponse.json(
          { ok: false, error: "conversation_unavailable" },
          { status: 404 },
        );
      }

      if (
        !planAllowsProvider(
          plan,
          conversation.provider === "email" ? "google" : conversation.provider,
        )
      ) {
        return NextResponse.json(
          { ok: false, error: "conversation_unavailable" },
          { status: 403 },
        );
      }

      const [messageResult, noteResult] = await Promise.all([
        supabase
          .from("messages")
          .select(
            "id, organization_id, conversation_id, provider_connection_id, provider_message_id, direction, body, message_type, metadata, sent_by_user_id, created_at",
          )
          .eq("organization_id", organizationId)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("internal_notes")
          .select(
            "id, organization_id, conversation_id, created_by, author_name, body, created_at",
          )
          .eq("organization_id", organizationId)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(200),
      ]);

      if (
        messageResult.error ||
        noteResult.error ||
        !Array.isArray(messageResult.data) ||
        !Array.isArray(noteResult.data)
      ) {
        return NextResponse.json(
          { ok: false, error: "conversation_unavailable" },
          { status: 503 },
        );
      }

      return NextResponse.json({
        ok: true,
        conversations: [],
        messages: messageResult.data,
        notes: noteResult.data,
        selectedConversation: conversation,
      });
    }

    const inbox = await getInboxSnapshot(organizationId, conversationId);

    if (!inbox.success) {
      return NextResponse.json({ ok: false, error: "inbox_unavailable" }, { status: 503 });
    }

    const visibleConversations = inbox.conversations.filter((conversation) =>
      planAllowsProvider(
        plan,
        conversation.provider === "email" ? "google" : conversation.provider,
      ),
    );
    const selectedVisible =
      inbox.selectedConversation &&
      planAllowsProvider(
        plan,
        inbox.selectedConversation.provider === "email"
          ? "google"
          : inbox.selectedConversation.provider,
      )
        ? inbox.selectedConversation
        : null;

    return NextResponse.json({
      ok: true,
      conversations: visibleConversations,
      messages: selectedVisible ? inbox.messages : [],
      notes: selectedVisible ? inbox.notes : [],
      selectedConversation: selectedVisible,
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

    if ("tags" in body) {
      if (!Array.isArray(body.tags) || body.tags.length > 12 ||
          body.tags.some((tag: unknown) => typeof tag !== "string" || tag.trim().length > 24 || !tag.trim())) {
        return NextResponse.json({ ok: false, error: "invalid_tags" }, { status: 400 });
      }
      const tags = [...new Set((body.tags as string[]).map((tag) => tag.trim()))];
      const { data: existing, error: metadataError } = await supabase
        .from("conversations").select("provider_metadata")
        .eq("id", conversationId).eq("organization_id", organizationId).maybeSingle();
      if (metadataError || !existing) return NextResponse.json({ ok: false, error: "conversation_unavailable" }, { status: 404 });
      updates.provider_metadata = { ...(existing.provider_metadata || {}), customer_tags: tags };
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


export async function DELETE(request: Request) {
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

    const body = await request.json();
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId.trim() : "";

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "conversation_required" },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("organization_id", memberships[0].organization_id);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: "conversation_delete_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "conversation_delete_failed" },
      { status: 500 },
    );
  }
}
