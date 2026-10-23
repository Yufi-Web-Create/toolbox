import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../../public/omnibox.html");
const checkout = read("./api/omnibox/billing/checkout/route.ts");
const portal = read("./api/omnibox/billing/portal/route.ts");
const webhook = read("./api/omnibox/billing/webhook/route.ts");
const sql = read("../../supabase/migrations/20261023180000_billing_003_subscriptions.sql");

describe("BILLING-003 integration safety contracts", () => {
  it("offers exactly three visible tiers at the agreed prices", () => {
    const plans = html.split("const planCatalog = {")[1].split("let providerInboxSyncStarted")[0];
    expect(plans).toContain("price: '無料'");
    expect(plans).toContain("price: '¥2,500/月'");
    expect(plans).toContain("price: '¥9,800/月'");
    expect(plans).not.toContain("premium:");
    expect(plans).not.toContain("enterprise:");
  });
  it("uses Stripe Checkout and billing portal, never direct paid upgrades", () => {
    expect(html).toContain("/api/omnibox/billing/checkout");
    expect(html).toContain("/api/omnibox/billing/portal");
    expect(html).not.toContain("現在は支払い処理なしで即時反映されます");
    expect(checkout).toContain('membership.role !== "owner"');
    expect(checkout).toContain('"subscription_data[metadata][organization_id]"');
    expect(portal).toContain('membership[0].role !== "owner"');
  });
  it("verifies webhook signature and restricts database writes", () => {
    expect(webhook).toContain("timingSafeEqual");
    expect(webhook).toContain("validStripeSignature(raw, signature, secret)");
    expect(webhook).toContain('customer.subscription.deleted');
    expect(sql).toContain("service_role");
    expect(sql).toContain("p_event_created");
    expect(sql).toContain("for update");
  });
});
