import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DEMO_ADMIN_EMAIL = "demo.admin@omnibox-demo.test";
const DEMO_STAFF_EMAIL = "demo.staff@omnibox-demo.test";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json(500, { ok: false, error: "server_not_configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const role = body.role === "staff" ? "staff" : "admin";
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: allUsers, error: listError } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (listError) return json(500, { ok: false, error: "demo_setup_failed" });

  async function ensureUser(email: string, name: string, accountType: "owner" | "member") {
    let user = allUsers.users.find((candidate) => candidate.email === email) ?? null;

    if (!user) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          account_type: accountType,
          demo_account: true,
        },
      });
      if (created.error || !created.data.user) {
        throw new Error("demo user create failed");
      }
      user = created.data.user;
    }

    return user;
  }

  let adminUser;
  let staffUser;
  try {
    adminUser = await ensureUser(DEMO_ADMIN_EMAIL, "デモ管理者", "owner");
    staffUser = await ensureUser(DEMO_STAFF_EMAIL, "デモスタッフ", "member");
  } catch {
    return json(500, { ok: false, error: "demo_setup_failed" });
  }

  let { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, created_by")
    .eq("login_id", "DEMO")
    .maybeSingle();

  if (organizationError) {
    return json(500, { ok: false, error: "demo_setup_failed" });
  }

  if (!organization) {
    const created = await admin
      .from("organizations")
      .insert({
        name: "OmniBox デモ組織",
        login_id: "DEMO",
        created_by: adminUser.id,
      })
      .select("id, created_by")
      .single();

    if (created.error || !created.data) {
      return json(500, { ok: false, error: "demo_setup_failed" });
    }
    organization = created.data;
  }

  const { error: membershipsError } = await admin
    .from("organization_members")
    .upsert([
      {
        organization_id: organization.id,
        organization_created_by: organization.created_by,
        user_id: adminUser.id,
        role: "owner",
      },
      {
        organization_id: organization.id,
        organization_created_by: organization.created_by,
        user_id: staffUser.id,
        role: "member",
      },
    ], { onConflict: "organization_id,user_id" });

  if (membershipsError) {
    return json(500, { ok: false, error: "demo_setup_failed" });
  }

  const email = role === "staff" ? DEMO_STAFF_EMAIL : DEMO_ADMIN_EMAIL;
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || typeof tokenHash !== "string" || !tokenHash) {
    return json(500, { ok: false, error: "demo_login_failed" });
  }

  return json(200, {
    ok: true,
    tokenHash,
    verificationType: "magiclink",
  });
});