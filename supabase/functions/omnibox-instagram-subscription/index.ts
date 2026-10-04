import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_seen",
  "message_reactions",
];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function parseTokenBundle(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function sanitizeMetaError(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const error =
    source.error && typeof source.error === "object"
      ? (source.error as Record<string, unknown>)
      : source;
  return {
    message: typeof error.message === "string" ? error.message : "Meta API request failed",
    type: typeof error.type === "string" ? error.type : null,
    code: typeof error.code === "number" ? error.code : null,
    errorSubcode:
      typeof error.error_subcode === "number" ? error.error_subcode : null,
  };
}

async function fetchSubscriptionStatus(
  igUserId: string,
  accessToken: string,
) {
  const url = new URL(
    `https://graph.instagram.com/v26.0/${encodeURIComponent(igUserId)}/subscribed_apps`,
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: sanitizeMetaError(data),
      subscriptions: [],
      success: false,
    };
  }

  const rows =
    data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).data)
      ? ((data as Record<string, unknown>).data as unknown[])
      : [];

  const subscriptions = rows
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: typeof item.id === "string" ? item.id : "",
        name: typeof item.name === "string" ? item.name : "",
        subscribedFields: Array.isArray(item.subscribed_fields)
          ? item.subscribed_fields.filter(
              (field): field is string => typeof field === "string",
            )
          : [],
      };
    });

  return {
    ok: true,
    status: response.status,
    error: null,
    subscriptions,
    success: true,
  };
}

async function metaRequest(
  action: "status" | "subscribe",
  igUserId: string,
  accessToken: string,
) {
  if (action === "status") {
    return fetchSubscriptionStatus(igUserId, accessToken);
  }

  const url = new URL(
    `https://graph.instagram.com/v26.0/${encodeURIComponent(igUserId)}/subscribed_apps`,
  );
  url.searchParams.set("subscribed_fields", SUBSCRIBED_FIELDS.join(","));
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: sanitizeMetaError(data),
      subscriptions: [],
      success: false,
    };
  }

  const postSucceeded =
    data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).success === true;

  const status = await fetchSubscriptionStatus(igUserId, accessToken);
  return {
    ...status,
    success: Boolean(postSucceeded && status.ok),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "server_not_configured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const accessJwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!accessJwt) {
    return json(401, { ok: false, error: "authentication_required" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await admin.auth.getUser(accessJwt);
  const userId = !userError ? userResult.user?.id ?? null : null;
  if (!userId) {
    return json(401, { ok: false, error: "authentication_required" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const action =
    payload.action === "subscribe" || payload.action === "status"
      ? payload.action
      : null;
  const connectionId =
    typeof payload.connectionId === "string" ? payload.connectionId.trim() : "";

  if (!action || !connectionId) {
    return json(400, { ok: false, error: "invalid_request" });
  }

  const { data: memberships, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1);

  const membership =
    !membershipError && Array.isArray(memberships) && memberships.length === 1
      ? memberships[0]
      : null;

  if (!membership || membership.role !== "owner") {
    return json(403, { ok: false, error: "owner_required" });
  }

  const { data: connection, error: connectionError } = await admin
    .from("provider_connections")
    .select("id, organization_id, provider, external_account_id, metadata")
    .eq("id", connectionId)
    .eq("organization_id", membership.organization_id)
    .eq("provider", "instagram")
    .maybeSingle();

  if (connectionError || !connection) {
    return json(404, { ok: false, error: "instagram_connection_not_found" });
  }

  const { data: secretValue, error: secretError } = await admin.rpc(
    "omnibox_get_provider_secret",
    { p_connection_id: connection.id },
  );
  const bundle = !secretError ? parseTokenBundle(secretValue) : null;
  const providerAccessToken =
    bundle && typeof bundle.access_token === "string"
      ? bundle.access_token
      : "";

  if (!providerAccessToken) {
    return json(409, { ok: false, error: "instagram_access_token_missing" });
  }

  const result = await metaRequest(
    action,
    String(connection.external_account_id ?? ""),
    providerAccessToken,
  );

  const fields = [
    ...new Set(
      result.subscriptions.flatMap((subscription) => subscription.subscribedFields),
    ),
  ];
  const subscriptionMetadata = {
    checked_at: new Date().toISOString(),
    action,
    success:
      result.ok &&
      (action === "status" || result.success === true),
    subscribed_fields: fields,
    messages_subscribed: fields.includes("messages"),
    error: result.ok ? null : result.error,
  };

  const existingMetadata =
    connection.metadata && typeof connection.metadata === "object"
      ? (connection.metadata as Record<string, unknown>)
      : {};

  await admin
    .from("provider_connections")
    .update({
      metadata: {
        ...existingMetadata,
        webhook_subscription: subscriptionMetadata,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (result.ok) {
    console.info("Instagram subscribed_apps request completed", {
      connectionId: connection.id,
      action,
      messagesSubscribed: fields.includes("messages"),
      fieldCount: fields.length,
    });
  } else {
    console.warn("Instagram subscribed_apps request failed", {
      connectionId: connection.id,
      action,
      status: result.status,
      error: result.error,
    });
  }

  return json(result.ok ? 200 : 502, {
    ok: result.ok,
    action,
    success:
      result.ok &&
      (action === "status" || result.success === true),
    subscribedFields: fields,
    messagesSubscribed: fields.includes("messages"),
    error: result.ok ? null : result.error,
  });
});