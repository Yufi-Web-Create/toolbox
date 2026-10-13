import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), fetch: vi.fn() }));
vi.mock("../../../../../lib/supabase/server", () => ({ createClient: mocks.createClient }));
describe("X sync API error guidance", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubGlobal("fetch", mocks.fetch);
    const query = { select: () => query, eq: () => query, limit: async () => ({ data: [{ organization_id: "org" }] }), maybeSingle: async () => ({ data: { plan_key: "standard" } }) };
    mocks.createClient.mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: "user" } } }), getSession: async () => ({ data: { session: { access_token: "token" } } }) }, from: () => query });
  });
  it("returns safe actionable credit guidance", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: false, error: "x_credits_depleted", detail: "private" }, { status: 502 }));
    const response = await POST();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, message: "X APIのクレジットが不足しています。X開発者コンソールの残高を確認してください。" });
  });
  it("does not forward unknown upstream details", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: false, error: "private", message: "private" }, { status: 502 }));
    expect(await (await POST()).json()).toEqual({ ok: false, message: "XのDMを同期できませんでした。" });
  });
  it("preserves successful zero-result sync", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: true, accounts: 1, imported: 0 }));
    expect(await (await POST()).json()).toEqual({ ok: true, accounts: 1, imported: 0 });
  });
});
