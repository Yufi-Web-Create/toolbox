import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORGANIZATION_ID = "919201e2-7c75-4c96-bc74-cb3b08da5a04";
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

  if (payload.organizationId !== ALLOWED_ORGANIZATION_ID) {
    return json(403, { ok: false, error: "organization_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: "server_not_configured" });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "inbound") {
    const conversationPayload = {
      organization_id: ALLOWED_ORGANIZATION_ID,
      provider: "line",
      provider_thread_id: payload.providerThreadId,
      customer_external_id: payload.customerExternalId,
      customer_display_name: payload.customerDisplayName || "LINE user",
      status: "unread",
      last_message_preview: String(payload.body ?? "").slice(0, 500),
      last_message_at: payload.occurredAt,
      updated_at: payload.occurredAt,
    };

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .upsert(conversationPayload, { onConflict: "organization_id,provider,provider_thread_id" })
      .select("id")
      .single();

    if (conversationError || !conversation?.id) {
      return json(500, { ok: false, error: "conversation_persist_failed" });
    }

    const { error: messageError } = await supabase.from("messages").upsert({
      organization_id: ALLOWED_ORGANIZATION_ID,
      conversation_id: conversation.id,
      provider_message_id: payload.providerMessageId,
      direction: "inbound",
      body: payload.body,
      sent_by_user_id: null,
      created_at: payload.occurredAt,
    }, {
      onConflict: "organization_id,provider_message_id",
      ignoreDuplicates: true,
    });

    if (messageError) return json(500, { ok: false, error: "message_persist_failed" });
    return json(200, { ok: true, conversationId: conversation.id });
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
      .eq("organization_id", ALLOWED_ORGANIZATION_ID)
      .maybeSingle();

    if (conversationError || !conversation) {
      return json(404, { ok: false, error: "conversation_not_found" });
    }

    const { error: messageError } = await supabase.from("messages").insert({
      organization_id: ALLOWED_ORGANIZATION_ID,
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
      .eq("organization_id", ALLOWED_ORGANIZATION_ID);

    if (updateError) return json(500, { ok: false, error: "conversation_update_failed" });
    return json(200, { ok: true });
  }

  return json(400, { ok: false, error: "unsupported_action" });
});
