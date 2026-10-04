import { NextResponse } from "next/server";

import {
  isPlanKey,
  PLAN_DEFINITIONS,
  planFeatures,
  type PlanKey,
} from "../../../../../lib/plans";
import { createClient } from "../../../../../lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  const userId =
    !error && typeof claims?.claims?.sub === "string"
      ? claims.claims.sub
      : null;

  if (!userId) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1);

  if (
    membershipError ||
    !Array.isArray(memberships) ||
    memberships.length !== 1
  ) {
    return null;
  }

  return {
    supabase,
    userId,
    organizationId: memberships[0].organization_id as string,
    role: memberships[0].role as "owner" | "member",
  };
}

export async function GET() {
  try {
    const ctx = await context();
    if (!ctx) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { data, error } = await ctx.supabase
      .from("organizations")
      .select("plan_key")
      .eq("id", ctx.organizationId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "プラン情報を読み込めませんでした。" },
        { status: 500 },
      );
    }

    const plan = isPlanKey(data.plan_key) ? data.plan_key : "standard";

    return NextResponse.json({
      ok: true,
      plan,
      definition: PLAN_DEFINITIONS[plan],
      features: planFeatures(plan),
      canChange: ctx.role === "owner",
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "プラン情報を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context();
    if (!ctx) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    if (ctx.role !== "owner") {
      return NextResponse.json(
        { ok: false, message: "プラン変更は管理者のみ行えます。" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const plan = body?.plan as PlanKey;

    if (!isPlanKey(plan)) {
      return NextResponse.json(
        { ok: false, message: "プランを確認してください。" },
        { status: 400 },
      );
    }

    const { data, error } = await ctx.supabase.rpc(
      "omnibox_update_organization_plan",
      {
        p_organization_id: ctx.organizationId,
        p_plan_key: plan,
      },
    );

    if (error || data !== true) {
      return NextResponse.json(
        { ok: false, message: "プランを変更できませんでした。" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
      definition: PLAN_DEFINITIONS[plan],
      features: planFeatures(plan),
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "プランを変更できませんでした。" },
      { status: 500 },
    );
  }
}
