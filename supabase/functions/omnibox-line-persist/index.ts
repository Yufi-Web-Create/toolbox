import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6p8c5sdMjuLveJ9fDYji
B6nYv9dzBKYj6SQiiIUidlM2arMNB2+1XOO+G2OuM8STxaSUo1W/HiOX1xM6J6k3
IGbaYxcgbHg1SX/QHcBgEAcgEh7z+uPM4fAL41r8ibpZTTB6NQTioD9IP6P7UL79
odHHxG/nzgpSLkJRk1Rdv3tgs/BXhnLEsd+Z4n3HjR9Z6aXQpvaKMpxs+NC4mKnN
66mtxIpMqCshWdU3XJihykXM9bnWXptlYFel3xSJpnfsWq6IeIa2AIIybDCoYFrM
+joq/q1rVjY+8LzaumzMPdJVn5bn//JhawpUQG/SfjhnTuWOVXolYRR+4Tpw6Zje
xwIDAQAB
-----END PUBLIC KEY-----`;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPublicKey() {
  const base64 = PUBLIC_KEY_PEM
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return await crypto.subtle.importKey(
    "spki",
    decodeBase64(base64),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function verifyBridgeRequest(rawBody: string, timestamp: string, signature: string) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;

  const key = await importPublicKey();
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64(signature),
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const timestamp = req.headers.get("x-omnibox-timestamp") ?? "";
  const signature = req.headers.get("x-omnibox-signature") ?? "";
  const rawBody = await req.text();

  if (!timestamp || !signature || !(await verifyBridgeRequest(rawBody, timestamp, signature))) {
    return json(401, { ok: false, error: "invalid_bridge_signature" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const organizationId =
    typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  const operatorAction =
    payload.action === "store-operator-config" ||
    payload.action === "get-operator-config" ||
    payload.action === "list-line-configs";

  if (!operatorAction && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    return json(400, { ok: false, error: "invalid_organization_id" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: "server_not_configured" });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!operatorAction) {
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .maybeSingle();

    if (organizationError) {
      return json(500, { ok: false, error: "organization_lookup_failed" });
    }
    if (!organization) {
      return json(404, { ok: false, error: "organization_not_found" });
    }
  }

  if (payload.action === "store-config") {
    const encryptedKey = String(payload.encryptedKey ?? "");
    const encryptedPayload = String(payload.encryptedPayload ?? "");
    const iv = String(payload.iv ?? "");
    const authTag = String(payload.authTag ?? "");

    if (!encryptedKey || !encryptedPayload || !iv || !authTag) {
      return json(400, { ok: false, error: "invalid_config_payload" });
    }

    const { data: existingConnection, error: connectionLookupError } =
      await supabase
        .from("provider_connections")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("provider", "line")
        .maybeSingle();

    if (connectionLookupError) {
      return json(500, { ok: false, error: "config_lookup_failed" });
    }

    const configPayload = {
      organization_id: organizationId,
      provider: "line",
      encrypted_key: encryptedKey,
      encrypted_payload: encryptedPayload,
      iv,
      auth_tag: authTag,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    const { error } = existingConnection?.id
      ? await supabase
          .from("provider_connections")
          .update(configPayload)
          .eq("id", existingConnection.id)
      : await supabase.from("provider_connections").insert(configPayload);

    if (error) return json(500, { ok: false, error: "config_store_failed" });
    return json(200, { ok: true });
  }

  if (payload.action === "get-config") {
    const { data, error } = await supabase
      .from("provider_connections")
      .select("encrypted_key, encrypted_payload, iv, auth_tag, updated_at")
      .eq("organization_id", organizationId)
      .eq("provider", "line")
      .maybeSingle();

    if (error) return json(500, { ok: false, error: "config_lookup_failed" });
    if (!data) return json(404, { ok: false, error: "config_not_found" });

    return json(200, { ok: true, config: data });
  }

  if (payload.action === "list-line-configs") {
    const { data, error } = await supabase
      .from("provider_connections")
      .select("organization_id, encrypted_key, encrypted_payload, iv, auth_tag, updated_at")
      .eq("provider", "line")
      .eq("status", "active");

    if (error) return json(500, { ok: false, error: "config_list_failed" });
    return json(200, { ok: true, configs: data ?? [] });
  }


  if (payload.action === "store-operator-config") {
    const provider = String(payload.provider ?? "");
    const encryptedKey = String(payload.encryptedKey ?? "");
    const encryptedPayload = String(payload.encryptedPayload ?? "");
    const iv = String(payload.iv ?? "");
    const authTag = String(payload.authTag ?? "");

    if (
      !["instagram", "x", "google", "ai"].includes(provider) ||
      !encryptedKey ||
      !encryptedPayload ||
      !iv ||
      !authTag
    ) {
      return json(400, { ok: false, error: "invalid_operator_config_payload" });
    }

    const { error } = await supabase.from("operator_provider_configs").upsert({
      provider,
      encrypted_key: encryptedKey,
      encrypted_payload: encryptedPayload,
      iv,
      auth_tag: authTag,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });

    if (error) return json(500, { ok: false, error: "operator_config_store_failed" });
    return json(200, { ok: true });
  }

  if (payload.action === "get-operator-config") {
    const provider = String(payload.provider ?? "");
    if (!["instagram", "x", "google", "ai"].includes(provider)) {
      return json(400, { ok: false, error: "invalid_provider" });
    }

    const { data, error } = await supabase
      .from("operator_provider_configs")
      .select("encrypted_key, encrypted_payload, iv, auth_tag, updated_at")
      .eq("provider", provider)
      .maybeSingle();

    if (error) return json(500, { ok: false, error: "operator_config_lookup_failed" });
    if (!data) return json(404, { ok: false, error: "operator_config_not_found" });
    return json(200, { ok: true, config: data });
  }

  if (payload.action === "claim-push-event") {
    const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return json(400, { ok: false });
    const { data: message } = await supabase.from("messages")
      .select("id,organization_id,conversation_id,direction,created_at")
      .eq("id", messageId).eq("organization_id", organizationId)
      .eq("direction", "inbound").maybeSingle();
    if (!message || Math.abs(Date.now() - new Date(message.created_at).getTime()) > 10 * 60_000)
      return json(200, { ok: true, claimed: false });
    const { data: conversation } = await supabase.from("conversations")
      .select("provider").eq("id", message.conversation_id)
      .eq("organization_id", organizationId).maybeSingle();
    if (!conversation || !["instagram", "x", "email"].includes(conversation.provider))
      return json(200, { ok: true, claimed: false });
    const { data: claimed, error: updateError } = await supabase.from("messages")
      .update({ push_notified_at: new Date().toISOString() })
      .eq("id", messageId).eq("organization_id", organizationId)
      .is("push_notified_at", null).select("id").maybeSingle();
    if (updateError) return json(500, { ok: false });
    return json(200, { ok: true, claimed: Boolean(claimed) });
  }

  if (payload.action === "list-push-subscriptions") {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("organization_id", organizationId);

    if (error) {
      return json(500, { ok: false, error: "push_subscription_lookup_failed" });
    }

    const endpoints = Array.from(
      new Set(
        (data ?? [])
          .map((row) => String(row.endpoint ?? "").trim())
          .filter((endpoint) => endpoint.startsWith("https://")),
      ),
    );

    return json(200, { ok: true, endpoints });
  }

  if (payload.action === "remove-push-subscriptions") {
    const endpoints = Array.isArray(payload.endpoints)
      ? payload.endpoints
          .map((value) => String(value ?? "").trim())
          .filter((endpoint) => endpoint.startsWith("https://"))
          .slice(0, 100)
      : [];

    if (endpoints.length > 0) {
      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("organization_id", organizationId)
        .in("endpoint", endpoints);

      if (error) {
        return json(500, { ok: false, error: "push_subscription_cleanup_failed" });
      }
    }

    return json(200, { ok: true });
  }

  if (payload.action === "inbound") {
    const { data: lineConnection, error: connectionError } = await supabase
      .from("provider_connections")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider", "line")
      .eq("status", "active")
      .maybeSingle();

    if (connectionError || !lineConnection?.id) {
      return json(500, { ok: false, error: "line_connection_missing" });
    }

    const { data: existingConversation, error: existingError } = await supabase
      .from("conversations")
      .select("id, customer_name_source")
      .eq("organization_id", organizationId)
      .eq("provider", "line")
      .eq("provider_thread_id", payload.providerThreadId)
      .maybeSingle();

    if (existingError) {
      return json(500, { ok: false, error: "conversation_lookup_failed" });
    }

    const conversationPayload: Record<string, unknown> = {
      organization_id: organizationId,
      provider: "line",
      provider_connection_id: lineConnection.id,
      provider_thread_id: payload.providerThreadId,
      customer_external_id: payload.customerExternalId,
      customer_avatar_url: payload.customerAvatarUrl || null,
      status: "unread",
      last_message_preview:
        payload.messageType === "sticker"
          ? "LINEスタンプ"
          : String(payload.body ?? "").slice(0, 500),
      last_message_at: payload.occurredAt,
      updated_at: payload.occurredAt,
    };

    if (existingConversation?.customer_name_source !== "custom") {
      conversationPayload.customer_display_name =
        payload.customerDisplayName || "LINE user";
      conversationPayload.customer_name_source = "provider";
    }

    let conversationId = existingConversation?.id ?? null;

    if (conversationId) {
      const { error: updateError } = await supabase
        .from("conversations")
        .update(conversationPayload)
        .eq("id", conversationId)
        .eq("organization_id", organizationId);

      if (updateError) {
        return json(500, { ok: false, error: "conversation_persist_failed" });
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("conversations")
        .insert(conversationPayload)
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        return json(500, { ok: false, error: "conversation_persist_failed" });
      }
      conversationId = inserted.id;
    }

    const { error: messageError } = await supabase.from("messages").upsert({
      organization_id: organizationId,
      conversation_id: conversationId,
      provider_connection_id: lineConnection.id,
      provider_message_id: payload.providerMessageId,
      direction: "inbound",
      body: payload.body,
      message_type:
        typeof payload.messageType === "string" ? payload.messageType : "text",
      metadata:
        payload.metadata && typeof payload.metadata === "object"
          ? payload.metadata
          : {},
      sent_by_user_id: null,
      created_at: payload.occurredAt,
    }, {
      onConflict: "organization_id,provider_message_id",
      ignoreDuplicates: true,
    });

    if (messageError) return json(500, { ok: false, error: "message_persist_failed" });
    return json(200, { ok: true, conversationId });
  }

  if (payload.action === "profile") {
    const conversationId = String(payload.conversationId ?? "");
    const displayName = String(payload.customerDisplayName ?? "").trim();
    const avatarUrl = String(payload.customerAvatarUrl ?? "").trim();

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, customer_name_source")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (conversationError || !conversation) {
      return json(404, { ok: false, error: "conversation_not_found" });
    }

    const updates: Record<string, unknown> = {
      customer_avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    };

    if (conversation.customer_name_source !== "custom" && displayName) {
      updates.customer_display_name = displayName;
      updates.customer_name_source = "provider";
    }

    const { error: updateError } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    if (updateError) {
      return json(500, { ok: false, error: "profile_update_failed" });
    }

    return json(200, {
      ok: true,
      customerDisplayName: displayName || null,
      customerAvatarUrl: avatarUrl || null,
    });
  }

  if (payload.action === "outbound") {
    const conversationId = String(payload.conversationId ?? "");
    const createdAt = String(payload.createdAt ?? new Date().toISOString());
    const body = String(payload.body ?? "");
    const sentByUserId = String(payload.sentByUserId ?? "");

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (conversationError || !conversation) {
      return json(404, { ok: false, error: "conversation_not_found" });
    }

    const { error: messageError } = await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      provider_message_id: payload.providerMessageId || null,
      direction: "outbound",
      body,
      sent_by_user_id: sentByUserId || null,
      created_at: createdAt,
    });

    if (messageError) return json(500, { ok: false, error: "message_persist_failed" });

    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        status: "in_progress",
        last_message_preview: body.slice(0, 500),
        last_message_at: createdAt,
        updated_at: createdAt,
      })
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    if (updateError) return json(500, { ok: false, error: "conversation_update_failed" });
    return json(200, { ok: true });
  }

  return json(400, { ok: false, error: "unsupported_action" });
});