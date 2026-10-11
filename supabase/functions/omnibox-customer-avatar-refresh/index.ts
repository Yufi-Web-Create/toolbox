import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const respond = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return respond(405, { ok: false });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !key || !jwt) return respond(401, { ok: false });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: userResult, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !userResult.user) return respond(401, { ok: false });
  let conversationId = "";
  try {
    const body = await req.json();
    conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  } catch { return respond(400, { ok: false }); }
  if (!/^[a-f0-9-]{36}$/i.test(conversationId)) return respond(400, { ok: false });

  const { data: memberships } = await admin.from("organization_members")
    .select("organization_id").eq("user_id", userResult.user.id).limit(1);
  if (!memberships?.length) return respond(403, { ok: false });
  const orgId = memberships[0].organization_id;
  const { data: conversation } = await admin.from("conversations")
    .select("id,provider,provider_connection_id,customer_external_id,customer_avatar_url,customer_name_source,customer_display_name")
    .eq("id", conversationId).eq("organization_id", orgId).maybeSingle();
  if (!conversation || !["instagram", "x"].includes(conversation.provider))
    return respond(404, { ok: false });
  const { data: connection } = await admin.from("provider_connections")
    .select("id,provider,status").eq("id", conversation.provider_connection_id)
    .eq("organization_id", orgId).eq("provider", conversation.provider).eq("status", "active").maybeSingle();
  if (!connection) return respond(404, { ok: false });
  const { data: secretValue, error: secretError } = await admin.rpc("omnibox_get_provider_secret",
    { p_connection_id: connection.id });
  if (secretError || !secretValue) return respond(503, { ok: false });
  let token = "";
  try { const bundle = JSON.parse(secretValue); token = typeof bundle.access_token === "string" ? bundle.access_token : ""; }
  catch { return respond(503, { ok: false }); }
  if (!token) return respond(503, { ok: false });
  const customerId = String(conversation.customer_external_id || "");
  let apiUrl: URL;
  if (conversation.provider === "instagram") {
    apiUrl = new URL("https://graph.instagram.com/" + encodeURIComponent(customerId));
    apiUrl.searchParams.set("fields", "id,name,username,profile_pic");
    apiUrl.searchParams.set("access_token", token);
  } else {
    apiUrl = new URL("https://api.x.com/2/users/" + encodeURIComponent(customerId));
    apiUrl.searchParams.set("user.fields", "name,username,profile_image_url");
  }
  let profile: Record<string, unknown>;
  try {
    const response = await fetch(apiUrl, {
      headers: conversation.provider === "x" ? { authorization: "Bearer " + token } : {},
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      console.warn("Customer avatar refresh failed", { provider: conversation.provider, httpStatus: response.status });
      return respond(503, { ok: false, error: "provider_unavailable" });
    }
    const json = await response.json();
    profile = conversation.provider === "x" ? json.data || {} : json;
  } catch {
    return respond(503, { ok: false, error: "provider_unavailable" });
  }
  const avatar = conversation.provider === "instagram" ? profile.profile_pic : profile.profile_image_url;
  const safeAvatar = typeof avatar === "string" && /^https:\/\//.test(avatar) ? avatar : null;
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim()
    : typeof profile.username === "string" && profile.username.trim() ? "@" + profile.username.trim() : null;
  if (!safeAvatar) return respond(200, { ok: true, customerAvatarUrl: null });
  const updates: Record<string, unknown> = { customer_avatar_url: safeAvatar };
  if (conversation.customer_name_source !== "custom" && name &&
      (!conversation.customer_display_name || conversation.customer_display_name === customerId))
    updates.customer_display_name = name;
  const { data: saved, error: updateError } = await admin.from("conversations").update(updates)
    .eq("id", conversationId).eq("organization_id", orgId)
    .select("customer_avatar_url,customer_display_name").maybeSingle();
  if (updateError) return respond(503, { ok: false });
  return respond(200, {
    ok: true, customerAvatarUrl: saved?.customer_avatar_url || safeAvatar,
    customerDisplayName: saved?.customer_display_name || conversation.customer_display_name
  });
});
