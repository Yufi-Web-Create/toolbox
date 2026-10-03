import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOrganizationWithOwner } from "./server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  createClient: mocks.createClient,
}));

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
