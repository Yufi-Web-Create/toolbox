import { beforeEach, describe, expect, it, vi } from "vitest";

import ApplicationPage from "./page";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getVisibleOrganizationStatus: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("../../lib/organizations/server", () => ({
  getVisibleOrganizationStatus: mocks.getVisibleOrganizationStatus,
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("/app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: true,
      hasOrganization: true,
    });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("routes authenticated organization members into the OmniBox inbox", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });

    await expect(ApplicationPage()).rejects.toThrow("redirect:/app/inbox");
    expect(mocks.getVisibleOrganizationStatus).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/app/inbox");
  });

  it("redirects an authenticated user without organizations to onboarding", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: true,
      hasOrganization: false,
    });

    await expect(ApplicationPage()).rejects.toThrow("redirect:/app/onboarding");
    expect(mocks.redirect).toHaveBeenCalledWith("/app/onboarding");
  });

  it("routes organization lookup failures to the inbox safe-error boundary", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: false,
      message: "safe error",
    });

    await expect(ApplicationPage()).rejects.toThrow("redirect:/app/inbox");
    expect(mocks.redirect).toHaveBeenCalledWith("/app/inbox");
  });

  it.each([
    { data: { claims: null }, error: null },
    { data: null, error: null },
  ])("redirects when claims are missing", async (claimsResult) => {
    mocks.getClaims.mockResolvedValue(claimsResult);

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/login?next=/app/inbox",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=/app/inbox");
    expect(mocks.getVisibleOrganizationStatus).not.toHaveBeenCalled();
  });

  it("fails closed when the auth provider returns an error", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: { message: "raw provider error" },
    });

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/login?next=/app/inbox",
    );
  });

  it("fails closed when claims lookup throws", async () => {
    mocks.getClaims.mockRejectedValue(new Error("raw exception"));

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/login?next=/app/inbox",
    );
  });
});
