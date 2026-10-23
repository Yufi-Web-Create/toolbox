import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members").select("organization_id, role")
    .eq("user_id", auth.user.id).limit(2);
  if (membershipError || memberships?.length !== 1 || memberships[0].role !== "owner")
    return NextResponse.json({ error: "組織管理者のみ操作できます。" }, { status: 403 });

  const key = process.env.STRIPE_SECRET_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!key || !serviceKey || !supabaseUrl || !site || !/^https:\/\//.test(site))
    return NextResponse.json({ error: "契約管理を準備中です。" }, { status: 503 });

  const admin = createAdminClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: billing, error: billingError } = await admin.from("organization_billing")
    .select("stripe_customer_id,stripe_subscription_id")
    .eq("organization_id", memberships[0].organization_id).maybeSingle();
  if (billingError) return NextResponse.json({ error: "契約情報を確認できません。" }, { status: 503 });
  if (!billing?.stripe_customer_id || !billing.stripe_subscription_id)
    return NextResponse.json({ error: "管理対象の有料契約が見つかりません。" }, { status: 404 });

  const params = new URLSearchParams({ customer: billing.stripe_customer_id, return_url: site + "/" });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: params, cache: "no-store",
  });
  const session = await response.json();
  if (!response.ok || typeof session.url !== "string")
    return NextResponse.json({ error: "契約管理画面を開けませんでした。" }, { status: 502 });
  return NextResponse.json({ ok: true, url: session.url });
}
