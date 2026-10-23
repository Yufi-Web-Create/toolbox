import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, createAdminClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: createAdminClient }));
import { POST } from "./route";

const organizationId = "ed32bc39-4543-44b2-a5d6-e16679dd6b2e";
const signatureSecret = "whsec_testing_only";
function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_local_test",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    data: { object: {
      id: "sub_local_test",
      customer: "cus_local_test",
      status: "active",
      metadata: { organization_id: organizationId, plan: "standard" },
      items: { data: [{ price: { id: "price_standard_test" } }] },
    } },
    ...overrides,
  };
}
function requestFor(payload: unknown, opts: { secret?: string; timestamp?: number; corrupt?: boolean } = {}) {
  const raw = JSON.stringify(payload);
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signed = createHmac("sha256", opts.secret ?? signatureSecret)
    .update(`${timestamp}.${raw}`).digest("hex");
  const signature = opts.corrupt ? "0".repeat(64) : signed;
  return new Request("https://example.com/api/omnibox/billing/webhook", {
    method: "POST", body: raw,
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
  });
}

describe("Stripe subscription webhook verification", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", signatureSecret);
    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_standard_test");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_test");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-test-key");
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    createAdminClient.mockReset().mockReturnValue({ rpc });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("applies only valid signed subscription events", async () => {
    const response = await POST(requestFor(buildEvent()));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("omnibox_apply_stripe_subscription",
      expect.objectContaining({
        p_organization_id: organizationId,
        p_plan_key: "standard",
        p_status: "active",
      }));
  });
  it("rejects invalid signature before database access", async () => {
    const response = await POST(requestFor(buildEvent(), { corrupt: true }));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("rejects expired signed timestamps", async () => {
    const response = await POST(requestFor(buildEvent(), {
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    }));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("refuses unrecognized price IDs", async () => {
    const event = buildEvent();
    event.data.object.items.data[0].price.id = "price_attacker";
    const response = await POST(requestFor(event));
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("applies cancellation as inactive entitlement", async () => {
    const event = buildEvent({ type: "customer.subscription.deleted" });
    const response = await POST(requestFor(event));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("omnibox_apply_stripe_subscription",
      expect.objectContaining({ p_status: "canceled" }));
  });
  it("returns retriable failure when database reconciliation fails", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(requestFor(buildEvent()));
    expect(response.status).toBe(503);
  });
});
