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

    if (
      loginType === "employee" &&
      (!organizationId || !ORGANIZATION_ID_PATTERN.test(organizationId))
    ) {
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

    if (loginType === "employee") {
      if (!membership || membership.role !== "member") {
        await supabase.auth.signOut();
        return NextResponse.json(
          { ok: false, message: "組織IDまたは従業員ログイン情報が正しくありません。" },
          { status: 401 },
        );
      }

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
          { ok: false, message: "組織IDまたは従業員ログイン情報が正しくありません。" },
          { status: 401 },
        );
      }
    } else if (membership?.role === "member") {
      await supabase.auth.signOut();
      return NextResponse.json(
        { ok: false, message: "このアカウントは従業員ログインをご利用ください。" },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "ログインできませんでした。もう一度お試しください。" },
      { status: 500 },
    );
  }
}
