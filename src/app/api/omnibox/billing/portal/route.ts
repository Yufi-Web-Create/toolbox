import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members").select("organization_id, role")
    .eq("user_id", auth.user.id).limit(2);
  if (membershipError || membership?.length !== 1 || membership[0].role !== "owner") {
    return NextResponse.json({ ok: false, error: "owner_required" }, { status: 403 });
  }
  const { data: billing, error: billingError } = await supabase
    .from("billing_subscriptions").select("stripe_customer_id")
    .eq("organization_id", membership[0].organization_id).maybeSingle();
  if (billingError || !billing?.stripe_customer_id) {
    return NextResponse.json({ ok: false, error: "subscription_not_found" }, { status: 404 });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  const base = process.env.APP_BASE_URL;
  if (!secret || !base || !base.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  }
  const params = new URLSearchParams({
    customer: billing.stripe_customer_id,
    return_url: new URL("/?billing=return", base).toString(),
  });
  try {
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params, cache: "no-store",
    });
    const result = await response.json() as { url?: string };
    if (!response.ok || !result.url?.startsWith("https://billing.stripe.com/")) {
      return NextResponse.json({ ok: false, error: "portal_unavailable" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, url: result.url });
  } catch {
    return NextResponse.json({ ok: false, error: "portal_unavailable" }, { status: 502 });
  }
}
