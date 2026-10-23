import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StripeSubscription = {
  id: string;
  customer: string | { id?: string };
  status: string;
  metadata?: { organization_id?: string; plan?: string };
  items?: { data?: Array<{ price?: { id?: string } }> };
};
type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: StripeSubscription };
};

function validStripeSignature(raw: string, header: string, secret: string): boolean {
  const parts = header.split(",").map(x => x.trim());
  const timestamp = parts.find(x => x.startsWith("t="))?.slice(2);
  const signatures = parts.filter(x => x.startsWith("v1=")).map(x => x.slice(3));
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const t = Number(timestamp);
  if (!Number.isSafeInteger(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  return signatures.some(hex => {
    if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
    const incoming = Buffer.from(hex, "hex");
    return incoming.length === expected.length && timingSafeEqual(incoming, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await request.text();
  if (!validStripeSignature(raw, signature, secret)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    return NextResponse.json({ received: true });
  }

  const sub = event.data?.object;
  const organizationId = sub?.metadata?.organization_id;
  const id = sub?.id;
  const customerId = typeof sub?.customer === "string" ? sub.customer : sub?.customer?.id;
  const priceId = sub?.items?.data?.[0]?.price?.id;
  const standardId = process.env.STRIPE_STANDARD_PRICE_ID;
  const proId = process.env.STRIPE_PRO_PRICE_ID;
  const plan = priceId && priceId === standardId ? "standard" : priceId && priceId === proId ? "pro" : null;
  // Only recognized, server-configured price IDs and organization IDs can create entitlements.
  if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(organizationId)
    || !id || !customerId || !plan || !priceId
    || !event.id || !Number.isSafeInteger(event.created) || !sub.status) {
    console.error("Stripe subscription event requires reconciliation", event.id);
    return NextResponse.json({ ok: false, error: "billing_reconciliation_required" }, { status: 422 });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ ok: false }, { status: 503 });

  const admin = createAdminClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("omnibox_apply_stripe_subscription", {
    p_organization_id: organizationId,
    p_subscription_id: id,
    p_customer_id: customerId,
    p_price_id: priceId,
    p_plan_key: plan,
    p_status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
    p_event_created: event.created,
    p_event_id: event.id,
  });
  if (error || data !== true) {
    console.error("Stripe subscription reconciliation failed", event.id, error?.code);
    return NextResponse.json({ ok: false, error: "billing_reconciliation_failed" }, { status: 503 });
  }
  return NextResponse.json({ received: true });
}
