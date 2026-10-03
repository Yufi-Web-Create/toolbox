import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORGANIZATION_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const loginType = body?.loginType === "employee" ? "employee" : "admin";
    void loginType;
    const organizationId =
      typeof body?.organizationId === "string"
        ? body.organizationId.trim().toUpperCase()
        : "";

    if (!email || !EMAIL_PATTERN.test(email) || !password) {
      return NextResponse.json(
        { ok: false, message: "メールアドレスまたはパスワードを確認してください。" },
        { status: 400 },
      );
    }

    if (organizationId && !ORGANIZATION_ID_PATTERN.test(organizationId)) {
      return NextResponse.json(
        { ok: false, message: "組織IDを確認してください。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, message: "ログイン情報が正しくありません。" },
        { status: 401 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", data.user.id)
      .limit(1);

    const membership =
      !membershipError && Array.isArray(memberships) && memberships.length === 1
        ? memberships[0]
        : null;

    if (!membership) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { ok: false, message: "所属組織を確認できませんでした。" },
        { status: 403 },
      );
    }

    // The stored membership is the source of truth. The UI selector is only a
    // login aid and must never turn a member into an administrator or block a
    // valid member merely because the selector was out of sync.
    if (membership.role === "member" && organizationId) {
      const { data: organizations, error: organizationError } = await supabase
        .from("organizations")
        .select("id, login_id")
        .eq("id", membership.organization_id)
        .limit(1);

      const organization =
        !organizationError &&
        Array.isArray(organizations) &&
        organizations.length === 1
          ? organizations[0]
          : null;

      if (
        !organization ||
        typeof organization.login_id !== "string" ||
        organization.login_id.toUpperCase() !== organizationId
      ) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { ok: false, message: "組織IDまたはログイン情報が正しくありません。" },
          { status: 401 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      roleKey: membership.role,
      loginType: membership.role === "member" ? "employee" : "admin",
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "ログインできませんでした。もう一度お試しください。" },
      { status: 500 },
    );
  }
}
