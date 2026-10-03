import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOrganization, type OnboardingState } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createOrganizationWithOwner: vi.fn(),
  getClaims: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("../../../lib/organizations/server", () => ({
  createOrganizationWithOwner: mocks.createOrganizationWithOwner,
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const initialState: OnboardingState = {
  status: "idle",
  message: "",
};

function createOnboardingData(name?: string) {
  const formData = new FormData();

  if (name !== undefined) {
    formData.set("organizationName", name);
  }

  return formData;
}

describe("createOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it.each([undefined, "", "   "])(
    "rejects a blank organization name without calling the RPC wrapper",
    async (name) => {
      const result = await createOrganization(
        initialState,
        createOnboardingData(name),
      );

      expect(result).toEqual({
        status: "error",
        message: "Enter an organization name.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.createOrganizationWithOwner).not.toHaveBeenCalled();
    },
  );

  it("uses the TENANT-002 wrapper and redirects to /app on success", async () => {
    mocks.createOrganizationWithOwner.mockResolvedValue({
      success: true,
      organizationId: "a0000000-0000-0000-0000-000000000001",
    });

    await expect(
      createOrganization(
        initialState,
        createOnboardingData("  Organization A  "),
      ),
    ).rejects.toThrow("redirect:/app");

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.createOrganizationWithOwner).toHaveBeenCalledWith(
      "Organization A",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("shows a safe error without exposing a raw wrapper error", async () => {
    const rawError = "raw Supabase error containing database details";
    mocks.createOrganizationWithOwner.mockResolvedValue({
      success: false,
      message: rawError,
    });

    const result = await createOrganization(
      initialState,
      createOnboardingData("Organization A"),
    );

    expect(result).toEqual({
      status: "error",
      message: "We could not create your organization. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain(rawError);
    expect(mocks.redirect).not.toHaveBeenCalledWith("/app");
  });

  it("redirects safely when trusted authentication claims are missing", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    await expect(
      createOrganization(
        initialState,
        createOnboardingData("Organization A"),
      ),
    ).rejects.toThrow("redirect:/login?next=/app/onboarding");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=/app/onboarding",
    );
    expect(mocks.createOrganizationWithOwner).not.toHaveBeenCalled();
  });
});
