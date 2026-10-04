import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

function internalEmailForLoginId(loginId: string) {
  return `${loginId}@login.omnibox.app`;
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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const loginId = normalizeLoginId(
    typeof payload.loginId === "string" ? payload.loginId : "",
  );
  const password = typeof payload.password === "string" ? payload.password : "";

  if (
    !name ||
    name.length > 100 ||
    !LOGIN_ID_PATTERN.test(loginId) ||
    password.length < 8
  ) {
    return json(400, { ok: false, error: "invalid_account" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await admin
    .from("login_ids")
    .select("user_id")
    .eq("login_id", loginId)
    .maybeSingle();

  if (existing) {
    return json(409, { ok: false, error: "login_id_taken" });
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: internalEmailForLoginId(loginId),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        account_type: "owner",
        login_id: loginId,
      },
    });

  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase() ?? "";
    return json(
      message.includes("already") ? 409 : 400,
      {
        ok: false,
        error: message.includes("already")
          ? "login_id_taken"
          : "account_create_failed",
      },
    );
  }

  const { error: idError } = await admin
    .from("login_ids")
    .insert({ user_id: created.user.id, login_id: loginId });

  if (idError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json(
      idError.code === "23505" ? 409 : 500,
      {
        ok: false,
        error: idError.code === "23505"
          ? "login_id_taken"
          : "login_id_create_failed",
      },
    );
  }

  return json(200, {
    ok: true,
    loginId,
    name,
  });
});
