import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/omnibox-x-sync/index.ts", "utf8")
  .replace(/^import .*;$/gm, "");
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(options: { status?: number; problem?: unknown; events?: unknown[]; secret?: string; expired?: boolean; ingestError?: boolean; refreshFailure?: boolean; saveError?: boolean; networkError?: boolean } = {}) {
  let handler!: (req: Request) => Promise<Response>;
  const log = vi.fn();
  const rpc = vi.fn(async (name: string) => {
    if (name === "omnibox_get_provider_secret") return { data: options.secret ?? JSON.stringify({ access_token: "private-token", refresh_token: "private-refresh", omnibox_client_id: "client", omnibox_client_secret: "private-secret" }) };
    if (name === "omnibox_replace_provider_secret") return { error: options.saveError ? {} : null };
    return { error: options.ingestError ? {} : null };
  });
  const connection = { id: "connection", external_account_id: "self", token_expires_at: options.expired ? "2020-01-01" : null };
  const fetcher = vi.fn(async (url: URL | string) => {
    if (options.networkError) throw new Error("private-token");
    if (String(url).includes("oauth2/token")) return Response.json({ access_token: "new-private-token", expires_in: 7200 }, { status: options.refreshFailure ? 401 : 200 });
    return Response.json(options.problem ?? { data: options.events ?? [] }, { status: options.status ?? 200 });
  });
  runInNewContext(script, {
    Request, Response, URL, URLSearchParams, Date, btoa, fetch: fetcher,
    console: { error: log },
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
      from: (table: string) => {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { organization_id: "org" } }), then: (resolve: (value: unknown) => unknown) => resolve({ data: table === "provider_connections" ? [connection] : [] }) };
        return query;
      }, rpc,
    }),
    Deno: { env: { get: () => "configured" }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  return { call: () => handler(new Request("https://test.invalid", { method: "POST", headers: { authorization: "Bearer user-token" } })), handler, log, rpc, fetcher };
}

const incoming = { id: "event", sender_id: "other", dm_conversation_id: "thread", text: "private message", created_at: "2026-10-13T00:00:00Z" };
describe("X sync Edge Function", () => {
  it.each([[400, "x_api_error"], [401, "x_reconnect_required"], [403, "x_access_denied"], [429, "x_rate_limited"], [402, "x_credits_depleted"]])("reports upstream %s without reporting success", async (status, code) => {
    const h = harness({ status: Number(status), problem: { detail: "private-token private message" } });
    const response = await h.call();
    expect(response.status).toBe(502);
    const result = await response.json();
    expect(result).toMatchObject({ ok: false, error: code, imported: 0, accounts: 0 });
    expect(JSON.stringify([result, h.log.mock.calls])).not.toContain("private");
  });
  it("recognizes depleted credits from the problem type", async () => {
    const h = harness({ status: 403, problem: { type: "https://api.x.com/2/problems/credits-depleted" } });
    expect(await (await h.call()).json()).toMatchObject({ error: "x_credits_depleted" });
  });
  it("keeps an empty successful inbox successful", async () => {
    expect(await (await harness().call()).json()).toEqual({ ok: true, accounts: 1, imported: 0 });
  });
  it("imports received messages and skips self-sent ones", async () => {
    const h = harness({ events: [incoming, { ...incoming, sender_id: "self" }] });
    expect(await (await h.call()).json()).toEqual({ ok: true, accounts: 1, imported: 1 });
    expect(h.rpc.mock.calls.filter(([name]) => name === "omnibox_ingest_external_message")).toHaveLength(1);
  });
  it("reports a storage failure", async () => {
    expect(await (await harness({ events: [incoming], ingestError: true }).call()).json()).toMatchObject({ ok: false, error: "x_message_save_failed", imported: 0 });
  });
  it("reports token refresh failure", async () => {
    expect(await (await harness({ expired: true, refreshFailure: true }).call()).json()).toMatchObject({ ok: false, error: "x_reconnect_required" });
  });
  it("stops after failure to persist a rotated token", async () => {
    const h = harness({ expired: true, saveError: true });
    expect(await (await h.call()).json()).toMatchObject({ error: "x_token_save_failed" });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports unavailable credentials", async () => {
    expect(await (await harness({ secret: "invalid" }).call()).json()).toMatchObject({ error: "x_credentials_unavailable" });
  });
  it("does not leak network exception contents", async () => {
    const h = harness({ networkError: true });
    const response = await h.call();
    expect(await response.json()).toMatchObject({ error: "x_sync_unavailable" });
    expect(JSON.stringify(h.log.mock.calls)).not.toContain("private");
  });
  it("rejects unauthenticated callers before accessing credentials", async () => {
    const h = harness();
    const response = await h.handler(new Request("https://test.invalid", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
