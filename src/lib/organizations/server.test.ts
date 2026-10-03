import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOrganizationWithOwner,
  getVisibleOrganizationStatus,
} from "./server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  limit: vi.fn(),
  rpc: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  createClient: mocks.createClient,
}));

describe("getVisibleOrganizationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: mocks.from });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ limit: mocks.limit });
  });

  it.each([
    { rows: [], hasOrganization: false },
    {
      rows: [{ id: "a0000000-0000-0000-0000-000000000001" }],
      hasOrganization: true,
    },
  ])(
    "reports whether at least one RLS-visible organization exists",
    async ({ rows, hasOrganization }) => {
      mocks.limit.mockResolvedValue({ data: rows, error: null });

      await expect(getVisibleOrganizationStatus()).resolves.toEqual({
        success: true,
        hasOrganization,
      });
      expect(mocks.from).toHaveBeenCalledWith("organizations");
      expect(mocks.select).toHaveBeenCalledWith("id");
      expect(mocks.limit).toHaveBeenCalledWith(1);
    },
  );

  it("fails closed without exposing a raw lookup error", async () => {
    const rawError = "raw database error containing tenant details";
    mocks.limit.mockResolvedValue({
      data: null,
      error: { message: rawError },
    });

    const result = await getVisibleOrganizationStatus();

    expect(result).toEqual({
      success: false,
      message: "We could not load your workspace. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain(rawError);
  });

  it("fails closed when the organization lookup throws", async () => {
    mocks.limit.mockRejectedValue(
      new Error("raw exception containing tenant details"),
    );

    await expect(getVisibleOrganizationStatus()).resolves.toEqual({
      success: false,
      message: "We could not load your workspace. Please try again.",
    });
  });
});

describe("createOrganizationWithOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("calls the organization bootstrap RPC and returns its UUID", async () => {
    const organizationId = "a0000000-0000-0000-0000-000000000001";
    mocks.rpc.mockResolvedValue({ data: organizationId, error: null });

    await expect(createOrganizationWithOwner(" Organization A ")).resolves.toEqual(
      { success: true, organizationId },
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_organization_with_owner",
      { p_name: " Organization A " },
    );
  });

  it("lets the database enforce the existing blank-name constraint", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "raw database constraint details" },
    });

    const result = await createOrganizationWithOwner("   ");

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_organization_with_owner",
      { p_name: "   " },
    );
    expect(result).toEqual({
      success: false,
      message: "We could not create your organization. Please try again.",
    });
  });

  it("does not expose a raw provider or database error", async () => {
    const rawError = "raw provider error containing database details";
    mocks.rpc.mockResolvedValue({ data: null, error: { message: rawError } });

    const result = await createOrganizationWithOwner("Organization A");

    expect(result).toEqual({
      success: false,
      message: "We could not create your organization. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain(rawError);
  });

  it("fails safely when the server client throws", async () => {
    mocks.createClient.mockRejectedValue(
      new Error("raw exception containing connection details"),
    );

    await expect(
      createOrganizationWithOwner("Organization A"),
    ).resolves.toEqual({
      success: false,
      message: "We could not create your organization. Please try again.",
    });
  });

  it("fails safely when the RPC returns an unexpected result", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(
      createOrganizationWithOwner("Organization A"),
    ).resolves.toEqual({
      success: false,
      message: "We could not create your organization. Please try again.",
    });
  });
});
