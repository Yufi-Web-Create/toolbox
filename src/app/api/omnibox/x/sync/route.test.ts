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
  it("returns only non-sensitive X Chat metadata status", async () => {
    mocks.fetch.mockResolvedValue(Response.json({
      ok: true, mode: "chat_status", accounts_checked: 1,
      conversations_on_first_pages: 2, has_more: false,
      secret: "never-forward"
    }));
    const response = await POST(new Request("http://localhost/api/omnibox/x/sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "chat_status" })
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, mode: "chat_status", accounts_checked: 1,
      conversations_on_first_pages: 2, has_more: false
    });
    const sent = JSON.parse(mocks.fetch.mock.calls.at(-1)?.[1]?.body);
    expect(sent).toEqual({ mode: "chat_status" });
  });
  it("returns only counts for registered X Chat key status", async () => {
    mocks.fetch.mockResolvedValue(Response.json({
      ok: true, mode: "chat_key_status", accounts_checked: 1,
      registered: 1, unregistered: 0, private_key: "must-not-leak"
    }));
    const response = await POST(new Request("http://localhost/api/omnibox/x/sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "chat_key_status" })
    }));
    expect(await response.json()).toEqual({
      ok: true, mode: "chat_key_status", accounts_checked: 1,
      registered: 1, unregistered: 0
    });
  });
  it("returns only allowed encrypted X Chat resources", async () => {
    mocks.fetch.mockResolvedValue(Response.json({
      ok: true, resource: "events", account_id: "123",
      data: [{ encoded_event: "ENCRYPTED" }],
      meta: { conversation_key_events: ["ENCRYPTED_KEY_CHANGE"] },
      errors: [], oauth_access_token: "DO_NOT_FORWARD"
    }));
    const response = await POST(new Request("http://localhost/api/omnibox/x/sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "chat_read", resource: "events",
        connection_id: "00000000-0000-4000-8000-000000000000",
        conversation_id: "123-456" })
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toEqual([{ encoded_event: "ENCRYPTED" }]);
    expect(payload.meta.conversation_key_events).toEqual(["ENCRYPTED_KEY_CHANGE"]);
    expect(payload.oauth_access_token).toBeUndefined();
  });
  it("rejects invalid or unscoped ciphertext reads before upstream call", async () => {
    const response = await POST(new Request("http://localhost/api/omnibox/x/sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "chat_read", resource: "events",
        connection_id: "../", conversation_id: "../../other" })
    }));
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("preserves successful zero-result sync", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: true, accounts: 1, imported: 0 }));
    expect(await (await POST()).json()).toEqual({ ok: true, accounts: 1, imported: 0 });
  });
});
