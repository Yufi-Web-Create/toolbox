import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });

  const { data: memberships, error: memberError } = await supabase
    .from("organization_members").select("organization_id, role")
    .eq("user_id", auth.user.id).limit(2);
  if (memberError || memberships?.length !== 1 || memberships[0].role !== "owner")
    return NextResponse.json({ error: "組織管理者のみ操作できます。" }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  const plan = body && typeof body === "object" && "plan" in body ? (body as { plan?: unknown }).plan : null;
  if (plan !== "standard" && plan !== "pro")
    return NextResponse.json({ error: "有効な有料プランを選んでください。" }, { status: 400 });

  const priceKey = plan === "standard" ? "STRIPE_PRICE_STANDARD" : "STRIPE_PRICE_PRO";
  const priceId = process.env[priceKey];
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !priceId) return NextResponse.json({ error: "決済の準備中です。" }, { status: 503 });

  // Never derive redirect URLs from user-supplied Origin or Host headers.
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!site || !/^https:\/\//.test(site))
    return NextResponse.json({ error: "決済URL設定が不足しています。" }, { status: 503 });

  const organizationId = String(memberships[0].organization_id);
  const { data: organization } = await supabase.from("organizations")
    .select("plan_key").eq("id", organizationId).single();
  if (!organization) return NextResponse.json({ error: "組織情報が見つかりません。" }, { status: 404 });

  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: site + "/?billing=success",
    cancel_url: site + "/?billing=cancel",
    client_reference_id: organizationId,
    "metadata[organization_id]": organizationId,
    "metadata[plan_key]": plan,
    "subscription_data[metadata][organization_id]": organizationId,
    "subscription_data[metadata][plan_key]": plan,
  });
  if (auth.user.email) params.set("customer_email", auth.user.email);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const checkout = await response.json();
  if (!response.ok || typeof checkout.url !== "string")
    return NextResponse.json({ error: "決済画面を準備できませんでした。" }, { status: 502 });

  // Never change plan here. Only verified subscription webhooks may grant paid access.
  return NextResponse.json({ ok: true, url: checkout.url });
}
