import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

Deno.serve(async (req) => {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json(500, { ok: false, error: "server_not_configured" });
  }

  const token = bearer(req);
  if (!token) return json(401, { ok: false, error: "unauthorized" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const caller = !userError ? userData.user : null;
  if (!caller) return json(401, { ok: false, error: "unauthorized" });

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return json(403, { ok: false, error: "membership_required" });
  }

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, created_by")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (organizationError || !organization) {
    return json(404, { ok: false, error: "organization_not_found" });
  }

  if (req.method === "GET") {
    const { data: members, error } = await admin
      .from("organization_members")
      .select("user_id, created_at")
      .eq("organization_id", organization.id)
      .eq("role", "member")
      .order("created_at", { ascending: true });

    if (error) return json(500, { ok: false, error: "members_load_failed" });

    const { data: usersData, error: usersError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (usersError) {
      return json(500, { ok: false, error: "members_load_failed" });
    }

    const users = new Map(usersData.users.map((user) => [user.id, user]));
    const employees = (members ?? []).map((member) => {
      const user = users.get(member.user_id);
      return {
        id: member.user_id,
        email: user?.email ?? "",
        name:
          typeof user?.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : user?.email?.split("@")[0] ?? "従業員",
        createdAt: member.created_at,
        lastSignInAt: user?.last_sign_in_at ?? null,
      };
    });

    return json(200, { ok: true, employees });
  }

  if (membership.role !== "owner") {
    return json(403, { ok: false, error: "owner_required" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  if (req.method === "POST") {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!name || name.length > 100 || !EMAIL_PATTERN.test(email) || password.length < 8) {
      return json(400, { ok: false, error: "invalid_employee" });
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          account_type: "member",
        },
      });

    if (createError || !created.user) {
      return json(400, {
        ok: false,
        error: createError?.message?.toLowerCase().includes("already")
          ? "email_already_exists"
          : "employee_create_failed",
      });
    }

    const { error: insertError } = await admin
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        organization_created_by: organization.created_by,
        user_id: created.user.id,
        role: "member",
      });

    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(500, { ok: false, error: "membership_create_failed" });
    }

    return json(200, {
      ok: true,
      employee: { id: created.user.id, email, name },
    });
  }

  const employeeId =
    typeof payload.employeeId === "string" ? payload.employeeId.trim() : "";

  if (!employeeId) {
    return json(400, { ok: false, error: "employee_required" });
  }

  const { data: employeeMembership, error: employeeMembershipError } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organization.id)
    .eq("user_id", employeeId)
    .maybeSingle();

  if (
    employeeMembershipError ||
    !employeeMembership ||
    employeeMembership.role !== "member"
  ) {
    return json(404, { ok: false, error: "employee_not_found" });
  }

  if (req.method === "PATCH") {
    const password = typeof payload.password === "string" ? payload.password : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";

    if (password && password.length < 8) {
      return json(400, { ok: false, error: "invalid_password" });
    }
    if (name && name.length > 100) {
      return json(400, { ok: false, error: "invalid_name" });
    }
    if (!password && !name) {
      return json(400, { ok: false, error: "no_changes" });
    }

    const attributes: Record<string, unknown> = {};
    if (password) attributes.password = password;

    if (name) {
      const { data: currentUser, error: currentUserError } =
        await admin.auth.admin.getUserById(employeeId);
      if (currentUserError || !currentUser.user) {
        return json(404, { ok: false, error: "employee_not_found" });
      }
      attributes.user_metadata = {
        ...(currentUser.user.user_metadata ?? {}),
        full_name: name,
        account_type: "member",
      };
    }

    const { data: updated, error: updateError } =
      await admin.auth.admin.updateUserById(employeeId, attributes);

    if (updateError || !updated.user) {
      return json(500, { ok: false, error: "employee_update_failed" });
    }

    return json(200, {
      ok: true,
      employee: {
        id: employeeId,
        email: updated.user.email ?? "",
        name:
          typeof updated.user.user_metadata?.full_name === "string"
            ? updated.user.user_metadata.full_name
            : updated.user.email?.split("@")[0] ?? "従業員",
      },
    });
  }

  const { error: membershipDeleteError } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", organization.id)
    .eq("user_id", employeeId);

  if (membershipDeleteError) {
    return json(500, { ok: false, error: "membership_delete_failed" });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(employeeId);
  if (deleteError) {
    return json(500, { ok: false, error: "employee_delete_failed" });
  }

  return json(200, { ok: true });
});