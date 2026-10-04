import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function parseBundle(value: unknown) {
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

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function isAuthorizedCron(
  admin: ReturnType<typeof createClient>,
  req: Request,
) {
  const supplied = req.headers.get("x-omnibox-cron-key") ?? "";
  if (!supplied) return false;

  const { data, error } = await admin.rpc("omnibox_get_system_secret", {
    p_name: "omnibox-publish-cron-key",
  });

  return !error && typeof data === "string" && constantTimeEqual(supplied, data);
}

async function refreshXToken(bundle: Record<string, unknown>) {
  const refreshToken =
    typeof bundle.refresh_token === "string" ? bundle.refresh_token : "";
  const clientId =
    typeof bundle.omnibox_client_id === "string"
      ? bundle.omnibox_client_id
      : "";
  const clientSecret =
    typeof bundle.omnibox_client_secret === "string"
      ? bundle.omnibox_client_secret
      : "";

  if (!refreshToken || !clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: "Basic " + btoa(clientId + ":" + clientSecret),
    },
    body,
  });

  if (!response.ok) return null;
  const refreshed = await response.json();
  if (typeof refreshed?.access_token !== "string") return null;

  return {
    ...bundle,
    ...refreshed,
    refresh_token:
      typeof refreshed.refresh_token === "string"
        ? refreshed.refresh_token
        : refreshToken,
  } as Record<string, unknown>;
}

async function publishX(
  admin: ReturnType<typeof createClient>,
  connection: Record<string, unknown>,
  content: string,
) {
  const { data: secretValue } = await admin.rpc(
    "omnibox_get_provider_secret",
    { p_connection_id: connection.id },
  );
  let bundle = parseBundle(secretValue);
  if (!bundle) {
    return { ok: false, error: "x_token_missing" };
  }

  let accessToken =
    typeof bundle.access_token === "string" ? bundle.access_token : "";
  const expiresAt =
    typeof connection.token_expires_at === "string"
      ? new Date(connection.token_expires_at).getTime()
      : 0;

  if (!accessToken || (expiresAt && expiresAt < Date.now() + 60_000)) {
    const refreshed = await refreshXToken(bundle);
    if (!refreshed) {
      return { ok: false, error: "x_token_refresh_failed" };
    }

    bundle = refreshed;
    accessToken = String(refreshed.access_token ?? "");
    const expiresIn =
      typeof refreshed.expires_in === "number"
        ? refreshed.expires_in
        : null;
    const nextExpiry = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    await admin.rpc("omnibox_replace_provider_secret", {
      p_connection_id: connection.id,
      p_secret_json: JSON.stringify(refreshed),
      p_token_expires_at: nextExpiry,
    });
  }

  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: "Bearer " + accessToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text: content }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: "x_publish_failed", detail: result };
  }

  return {
    ok: true,
    providerPostId:
      typeof result?.data?.id === "string" ? result.data.id : null,
  };
}

async function waitForInstagramContainer(
  creationId: string,
  accessToken: string,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const url = new URL(
      `https://graph.instagram.com/v26.0/${encodeURIComponent(creationId)}`,
    );
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url);
    const result = await response.json().catch(() => ({}));
    const statusCode =
      typeof result?.status_code === "string" ? result.status_code : "";

    if (response.ok && statusCode === "FINISHED") return true;
    if (statusCode === "ERROR" || statusCode === "EXPIRED") return false;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return true;
}

async function publishInstagram(
  admin: ReturnType<typeof createClient>,
  connection: Record<string, unknown>,
  content: string,
  mediaUrl: string,
) {
  const { data: secretValue } = await admin.rpc(
    "omnibox_get_provider_secret",
    { p_connection_id: connection.id },
  );
  const bundle = parseBundle(secretValue);
  const accessToken =
    bundle && typeof bundle.access_token === "string"
      ? bundle.access_token
      : "";
  const accountId =
    typeof connection.external_account_id === "string"
      ? connection.external_account_id
      : "";

  if (!accessToken || !accountId) {
    return { ok: false, error: "instagram_token_missing" };
  }
  if (!mediaUrl) {
    return { ok: false, error: "instagram_media_required" };
  }

  const createUrl = new URL(
    `https://graph.instagram.com/v26.0/${encodeURIComponent(accountId)}/media`,
  );
  createUrl.searchParams.set("image_url", mediaUrl);
  createUrl.searchParams.set("caption", content);
  createUrl.searchParams.set("access_token", accessToken);

  const createResponse = await fetch(createUrl, { method: "POST" });
  const created = await createResponse.json().catch(() => ({}));
  const creationId =
    typeof created?.id === "string" ? created.id : "";

  if (!createResponse.ok || !creationId) {
    return {
      ok: false,
      error: "instagram_container_failed",
      detail: created,
    };
  }

  const ready = await waitForInstagramContainer(creationId, accessToken);
  if (!ready) {
    return { ok: false, error: "instagram_container_not_ready" };
  }

  const publishUrl = new URL(
    `https://graph.instagram.com/v26.0/${encodeURIComponent(accountId)}/media_publish`,
  );
  publishUrl.searchParams.set("creation_id", creationId);
  publishUrl.searchParams.set("access_token", accessToken);

  const publishResponse = await fetch(publishUrl, { method: "POST" });
  const published = await publishResponse.json().catch(() => ({}));

  if (!publishResponse.ok) {
    return {
      ok: false,
      error: "instagram_publish_failed",
      detail: published,
    };
  }

  return {
    ok: true,
    providerPostId:
      typeof published?.id === "string" ? published.id : null,
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  if (!postId) {
    return json(400, { ok: false, error: "post_required" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cronAuthorized = await isAuthorizedCron(admin, req);
  let user: { id: string } | null = null;

  if (!cronAuthorized) {
    const token = bearer(req);
    if (!token) {
      return json(401, { ok: false, error: "unauthorized" });
    }

    const { data: authData, error: authError } =
      await admin.auth.getUser(token);
    user = !authError && authData.user ? { id: authData.user.id } : null;

    if (!user) {
      return json(401, { ok: false, error: "unauthorized" });
    }
  }

  const { data: post, error: postError } = await admin
    .from("social_posts")
    .select(
      "id, organization_id, created_by, content, media_url, target_connection_ids, scheduled_at, status",
    )
    .eq("id", postId)
    .maybeSingle();

  if (postError || !post) {
    return json(404, { ok: false, error: "post_not_found" });
  }

  if (cronAuthorized) {
    if (
      post.status !== "scheduled" ||
      !post.scheduled_at ||
      new Date(post.scheduled_at).getTime() > Date.now()
    ) {
      return json(409, { ok: false, error: "post_not_due" });
    }
  } else {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", post.organization_id)
      .eq("user_id", user!.id)
      .maybeSingle();

    if (!membership) {
      return json(403, { ok: false, error: "forbidden" });
    }
  }

  if (!Array.isArray(post.target_connection_ids) || post.target_connection_ids.length === 0) {
    return json(400, { ok: false, error: "targets_missing" });
  }

  await admin
    .from("social_posts")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", post.id);

  const { data: connections, error: connectionError } = await admin
    .from("provider_connections")
    .select(
      "id, organization_id, provider, external_account_id, token_expires_at, status, account_name",
    )
    .eq("organization_id", post.organization_id)
    .in("id", post.target_connection_ids)
    .eq("status", "active");

  if (connectionError) {
    await admin
      .from("social_posts")
      .update({
        status: "failed",
        last_error: "connections_unavailable",
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);
    return json(500, { ok: false, error: "connections_unavailable" });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const connection of connections ?? []) {
    let result: Record<string, unknown>;

    if (connection.provider === "x") {
      result = await publishX(admin, connection, post.content);
    } else if (connection.provider === "instagram") {
      result = await publishInstagram(
        admin,
        connection,
        post.content,
        post.media_url ?? "",
      );
    } else {
      result = { ok: false, error: "publishing_not_supported" };
    }

    results.push({
      connectionId: connection.id,
      provider: connection.provider,
      accountName: connection.account_name,
      ...result,
    });
  }

  const successCount = results.filter((item) => item.ok === true).length;
  const finalStatus =
    successCount === results.length && results.length > 0
      ? "published"
      : successCount > 0
        ? "partial_failed"
        : "failed";

  await admin
    .from("social_posts")
    .update({
      status: finalStatus,
      results,
      last_error:
        finalStatus === "published"
          ? null
          : String(
              results.find((item) => item.ok !== true)?.error ??
                "publish_failed",
            ),
      published_at:
        successCount > 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);

  return json(200, {
    ok: finalStatus === "published",
    status: finalStatus,
    results,
  });
});