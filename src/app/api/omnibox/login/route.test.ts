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
  orgSelect: vi.fn(),
  orgEq: vi.fn(),
  orgLimit: vi.fn(),
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
          email: "staff@example.com",
        },
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "organization_members") {
        return { select: mocks.memberSelect };
      }
      if (table === "organizations") {
        return { select: mocks.orgSelect };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    mocks.memberSelect.mockReturnValue({ eq: mocks.memberEq });
    mocks.memberEq.mockReturnValue({ limit: mocks.memberLimit });
    mocks.memberLimit.mockResolvedValue({
      data: [{ organization_id: "org-1", role: "member" }],
      error: null,
    });

    mocks.orgSelect.mockReturnValue({ eq: mocks.orgEq });
    mocks.orgEq.mockReturnValue({ limit: mocks.orgLimit });
    mocks.orgLimit.mockResolvedValue({
      data: [{ id: "org-1", login_id: "OMNIBOX" }],
      error: null,
    });

    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("allows a member with matching organization ID", async () => {
    const response = await POST(
      request({
        loginType: "employee",
        organizationId: "omnibox",
        email: "staff@example.com",
        password: "password123",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      roleKey: "member",
      loginType: "employee",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("rejects a member when the organization ID does not match", async () => {
    const response = await POST(
      request({
        loginType: "employee",
        organizationId: "OTHER",
        email: "staff@example.com",
        password: "password123",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("auto-detects a member even when the UI submits administrator mode", async () => {
    const response = await POST(
      request({
        loginType: "admin",
        email: "staff@example.com",
        password: "password123",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      roleKey: "member",
      loginType: "employee",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
