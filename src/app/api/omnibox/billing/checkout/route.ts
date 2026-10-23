import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

const priceEnv = {
  standard: "STRIPE_STANDARD_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
} as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", auth.user.id)
    .limit(2);

  if (membershipError || memberships?.length !== 1) {
    return NextResponse.json({ ok: false, error: "membership_invalid" }, { status: 403 });
  }
  const membership = memberships[0];
  if (membership.role !== "owner") {
    return NextResponse.json({ ok: false, error: "owner_required" }, { status: 403 });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const plan = (payload as { plan?: unknown } | null)?.plan;
  if (plan !== "standard" && plan !== "pro") {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  // Avoid creating an additional paid subscription for an already subscribed organization.
  const { data: existing, error: billingError } = await supabase
    .from("billing_subscriptions")
    .select("status")
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (billingError) {
    return NextResponse.json({ ok: false, error: "billing_state_unavailable" }, { status: 503 });
  }
  if (existing && ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(existing.status)) {
    return NextResponse.json({ ok: false, error: "use_billing_portal" }, { status: 409 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env[priceEnv[plan]];
  const base = process.env.APP_BASE_URL;
  if (!secret || !price || !base || !/^https:\/\//.test(base)) {
    return NextResponse.json({ ok: false, error: "billing_not_configured" }, { status: 503 });
  }

  const url = new URL(base);
  const orgId = membership.organization_id as string;
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: orgId,
    "metadata[organization_id]": orgId,
    "metadata[plan]": plan,
    "subscription_data[metadata][organization_id]": orgId,
    "subscription_data[metadata][plan]": plan,
    success_url: new URL("/?billing=success", url).toString(),
    cancel_url: new URL("/?billing=cancel", url).toString(),
  });
  if (auth.user.email) params.set("customer_email", auth.user.email);

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `matomeet-checkout-${orgId}-${plan}-${Math.floor(Date.now() / 60000)}`,
      },
      body: params,
      cache: "no-store",
    });
    const checkout = await response.json() as { url?: string };
    if (!response.ok || typeof checkout.url !== "string" || !checkout.url.startsWith("https://checkout.stripe.com/")) {
      console.error("Stripe checkout creation failed", response.status);
      return NextResponse.json({ ok: false, error: "checkout_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, url: checkout.url });
  } catch {
    return NextResponse.json({ ok: false, error: "checkout_unavailable" }, { status: 502 });
  }
}
