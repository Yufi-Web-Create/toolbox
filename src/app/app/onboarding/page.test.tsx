import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingPage from "./page";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getVisibleOrganizationStatus: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("../../../lib/organizations/server", () => ({
  getVisibleOrganizationStatus: mocks.getVisibleOrganizationStatus,
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./onboarding-form", () => ({
  OnboardingForm: () => (
    <form>
      <label htmlFor="organization-name">Organization name</label>
      <input id="organization-name" name="organizationName" />
      <button type="submit">Create workspace</button>
    </form>
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("/app/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: true,
      hasOrganization: false,
    });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("redirects an unauthenticated user to login with a local next path", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    await expect(OnboardingPage()).rejects.toThrow(
      "redirect:/login?next=/app/onboarding",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/login?next=/app/onboarding",
    );
    expect(mocks.getVisibleOrganizationStatus).not.toHaveBeenCalled();
  });

  it("redirects a user with an existing organization to /app", async () => {
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: true,
      hasOrganization: true,
    });

    await expect(OnboardingPage()).rejects.toThrow("redirect:/app");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("shows the minimal form to a user without organizations", async () => {
    const html = renderToStaticMarkup(await OnboardingPage());

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.getVisibleOrganizationStatus).toHaveBeenCalledOnce();
    expect(html).toContain("<h1>Set up your workspace</h1>");
    expect(html).toContain("Organization name");
    expect(html).toContain("Create workspace");
  });

  it("fails closed without rendering the form when lookup fails", async () => {
    const rawError = "raw database error containing tenant details";
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: false,
      message: "We could not load your workspace. Please try again.",
      rawError,
    });

    const html = renderToStaticMarkup(await OnboardingPage());

    expect(html).toContain("Workspace setup unavailable");
    expect(html).toContain("We could not load your workspace. Please try again.");
    expect(html).not.toContain("Organization name");
    expect(html).not.toContain(rawError);
  });
});
