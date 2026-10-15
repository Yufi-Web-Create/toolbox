import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  memberships: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  resolve: vi.fn(),
  connect: vi.fn(),
  logout: vi.fn(),
  verify: vi.fn(),
  close: vi.fn(),
  transport: vi.fn(),
  imapOptions: vi.fn(),
}));

vi.mock("../../../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("../../../../../lib/mail/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/mail/security")>();
  return { ...actual, resolvePublicMailHost: mocks.resolve };
});
vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor(options: unknown) { mocks.imapOptions(options); }
    connect() { return mocks.connect(); }
    logout() { return mocks.logout(); }
  },
}));
vi.mock("nodemailer", () => ({
  createTransport: (options: unknown) => {
    mocks.transport(options);
    return { verify: mocks.verify, close: mocks.close };
  },
}));

const credentials = {
  email: "hello@example.jp",
  displayName: "試験用窓口",
  username: "hello@example.jp",
  password: "fake-unit-test-password",
  imapHost: "imap.example.jp",
  smtpHost: "smtp.example.jp",
  smtpPort: 587,
};
function request(action: string, body: Record<string, unknown> = credentials) {
  return new Request("http://localhost/api/omnibox/mail/imap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, action }),
  });
}

describe("IMAP + SMTP connection without a real email account", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "test-user" } }, error: null });
    mocks.memberships.mockResolvedValue({ data: [{
      organization_id: "test-organization", role: "owner",
    }], error: null });
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: mocks.memberships,
    };
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.claims },
      from: vi.fn(() => builder),
      rpc: mocks.rpc,
    });
    mocks.resolve.mockImplementation(async (hostname: string) =>
      hostname.startsWith("imap") ? "8.8.8.8" : "1.1.1.1");
    mocks.connect.mockResolvedValue(undefined);
    mocks.logout.mockResolvedValue(undefined);
    mocks.verify.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: "connection-id", error: null });
  });

  it("checks both TLS-authenticated transports and does not store during test", async () => {
    const response = await POST(request("test"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, tested: true });
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.imapOptions).toHaveBeenCalledWith(expect.objectContaining({
      host: "8.8.8.8", port: 993, secure: true,
      tls: expect.objectContaining({ servername: credentials.imapHost, rejectUnauthorized: true }),
    }));
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({
      host: "1.1.1.1", port: 587, secure: false, requireTLS: true,
      tls: expect.objectContaining({ servername: credentials.smtpHost, rejectUnauthorized: true }),
    }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("stores only after both transports succeed, using the Vault RPC", async () => {
    const response = await POST(request("save"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, connectionId: "connection-id",
      message: "メールアカウントを安全に保存しました。",
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    const [rpcName, rpcParams] = mocks.rpc.mock.calls[0];
    expect(rpcName).toBe("omnibox_store_imap_connection");
    expect(rpcParams.p_email).toBe(credentials.email);
    const vaultPayload = JSON.parse(rpcParams.p_secret_json);
    expect(vaultPayload).toMatchObject({
      imapHost: credentials.imapHost, smtpHost: credentials.smtpHost,
      password: credentials.password,
    });
    expect(mocks.verify).toHaveBeenCalledOnce();
  });

  it("does not store when SMTP login fails, and never reveals a password", async () => {
    mocks.verify.mockRejectedValue(new Error("server error included password " + credentials.password));
    const response = await POST(request("save"));
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain(credentials.password);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("does not attempt network operations if IMAP login fails", async () => {
    mocks.connect.mockRejectedValue(new Error("authentication failed"));
    const response = await POST(request("save"));
    expect(response.status).toBe(502);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects non-owner members before reading mailbox credentials or resolving DNS", async () => {
    mocks.memberships.mockResolvedValue({ data: [{
      organization_id: "test-organization", role: "member",
    }], error: null });
    const response = await POST(request("save"));
    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires an authenticated session before testing any mailbox", async () => {
    mocks.claims.mockResolvedValue({ data: { claims: null }, error: null });
    const response = await POST(request("test"));
    expect(response.status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("rejects internal, unqualified and non-TLS server settings", async () => {
    const response = await POST(request("save", { ...credentials, imapHost: "localhost", smtpPort: 25 }));
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
