import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  memberSelect: vi.fn(),
  memberEq: vi.fn(),
  memberLimit: vi.fn(),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

function request(body: Record<string, unknown>) {
  return new Request("https://example.test/api/omnibox/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("OmniBox login API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
      },
      from: mocks.from,
    });

    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "10000000-0000-0000-0000-000000000001",
          user_metadata: {
            account_type: "member",
            login_id: "staff01",
          },
        },
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "organization_members") {
        return { select: mocks.memberSelect };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    mocks.memberSelect.mockReturnValue({ eq: mocks.memberEq });
    mocks.memberEq.mockReturnValue({ limit: mocks.memberLimit });
    mocks.memberLimit.mockResolvedValue({
      data: [{ organization_id: "org-1", role: "member" }],
      error: null,
    });

    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("logs an employee in with ID and password", async () => {
    const response = await POST(
      request({
        loginType: "employee",
        loginId: "staff01",
        password: "password123",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      roleKey: "member",
      loginType: "employee",
      loginId: "staff01",
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "staff01@login.omnibox.app",
      password: "password123",
    });
  });

  it("rejects a role mismatch", async () => {
    const response = await POST(
      request({
        loginType: "admin",
        loginId: "staff01",
        password: "password123",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("rejects malformed login IDs before authentication", async () => {
    const response = await POST(
      request({ loginType: "employee", loginId: "x", password: "password123" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
