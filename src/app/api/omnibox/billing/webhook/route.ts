import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: Record<string, unknown> } };
function secureEqual(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && requireEqual(x, y);
}
function requireEqual(a: Buffer, b: Buffer) {
  // Node's timingSafeEqual is constant-time for same-length buffers.
  return timingSafeEqual(a, b);
}
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(raw: string, header: string, secret: string): boolean {
  const parts = header.split(",").map(v => v.trim());
  const time = parts.find(v => v.startsWith("t="))?.slice(2);
  const signatures = parts.filter(v => v.startsWith("v1=")).map(v => v.slice(3));
  if (!time || !/^\d+$/.test(time) || Math.abs(Date.now() / 1000 - Number(time)) > 300) return false;
  const expected = createHmac("sha256", secret).update(time + "." + raw).digest("hex");
  return signatures.some(signature => /^[a-f0-9]{64}$/i.test(signature) && secureEqual(signature, expected));
}

async function stripeGet(path: string, key: string) {
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    headers: { Authorization: "Bearer " + key }, cache: "no-store",
  });
  if (!response.ok) throw new Error("stripe retrieve failed");
  return response.json() as Promise<Record<string, unknown>>;
}
function scalar(value: unknown) { return typeof value === "string" ? value : null; }
function subscriptionId(event: StripeEvent): string | null {
  const obj = event.data?.object;
  if (!obj) return null;
  if (event.type.startsWith("customer.subscription.")) return scalar(obj.id);
  if (event.type.startsWith("invoice.")) {
    const parent = obj.parent as Record<string, unknown> | undefined;
    const details = parent?.subscription_details as Record<string, unknown> | undefined;
    return scalar(details?.subscription) || scalar(obj.subscription);
  }
  if (event.type === "checkout.session.completed") return scalar(obj.subscription);
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !key || !serviceKey || !supabaseUrl) return new Response("not configured", { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!verify(raw, signature, secret)) return new Response("bad signature", { status: 400 });

  let event: StripeEvent;
  try { event = JSON.parse(raw); } catch { return new Response("bad event", { status: 400 }); }
  if (!event.id || !event.type) return new Response("bad event", { status: 400 });
  const id = subscriptionId(event);
  if (!id) return NextResponse.json({ received: true, ignored: true });

  try {
    // Always retrieve current subscription to avoid trusting possibly stale event payloads.
    const subscription = await stripeGet("subscriptions/" + encodeURIComponent(id), key);
    const metadata = subscription.metadata as Record<string, unknown> | undefined;
    const organizationId = scalar(metadata?.organization_id);
    const customer = scalar(subscription.customer);
    const items = subscription.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
    const priceId = items?.data?.[0]?.price?.id;
    const priceEntries = [
      ["standard", process.env.STRIPE_PRICE_STANDARD],
      ["pro", process.env.STRIPE_PRICE_PRO],
    ] as const;
    const plan = priceEntries.find(([, price]) => price && price === priceId)?.[0];
    if (!organizationId || !customer || !priceId || !plan)
      return new Response("invalid subscription mapping", { status: 422 });

    const status = scalar(subscription.status) || "inactive";
    const period = subscription.current_period_end;
    const end = typeof period === "number" ? new Date(period * 1000).toISOString() : null;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc("matomeet_apply_stripe_subscription", {
      p_event_id: event.id, p_event_type: event.type,
      p_organization_id: organizationId, p_customer_id: customer,
      p_subscription_id: id, p_price_id: priceId,
      p_status: status, p_plan: plan, p_period_end: end,
    });
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe billing webhook failed", event.id, error);
    return new Response("retry later", { status: 500 });
  }
}
