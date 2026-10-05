import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

const VAPID_PUBLIC_KEY = "BJFewoxJmzt56_QIP9yMzzWzn5LM-atZzpFbEUvqOd-7Q2pRX3wFia31OsZNbJr_OfgAJMRJ_sy4em_iq61Sb-g";

async function authenticatedContext() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId =
    !claimsError && typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (!userId) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
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
    organizationId: String(memberships[0].organization_id),
  };
}

export async function GET() {
  return NextResponse.json({ ok: true, vapidPublicKey: VAPID_PUBLIC_KEY });
}

export async function POST(request: Request) {
  const context = await authenticatedContext();
  if (!context) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request" }, { status: 400 });
  }

  const endpoint =
    typeof payload.endpoint === "string" ? payload.endpoint.trim() : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 4000) {
    return NextResponse.json({ ok: false, message: "Invalid endpoint" }, { status: 400 });
  }

  const { error } = await context.supabase
    .from("push_subscriptions")
    .upsert(
      {
        organization_id: context.organizationId,
        user_id: context.userId,
        endpoint,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    console.error("Push subscription save failed", error);
    return NextResponse.json(
      { ok: false, message: "通知設定を保存できませんでした" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await authenticatedContext();
  if (!context) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request" }, { status: 400 });
  }

  const endpoint =
    typeof payload.endpoint === "string" ? payload.endpoint.trim() : "";
  if (!endpoint) {
    return NextResponse.json({ ok: false, message: "Invalid endpoint" }, { status: 400 });
  }

  const { error } = await context.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", context.userId)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("Push subscription delete failed", error);
    return NextResponse.json(
      { ok: false, message: "通知設定を解除できませんでした" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
