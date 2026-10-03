import { renderToStaticMarkup } from "react-dom/server";
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

  it("renders the minimal shell only when authenticated claims exist", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });

    const html = renderToStaticMarkup(await ApplicationPage());

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.getVisibleOrganizationStatus).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain("<h1>Application</h1>");
    expect(html).toContain("You are signed in.");
    expect(html).toContain('href="/app/inbox"');
    expect(html).toContain("LINE受信箱を開く");
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

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/app/onboarding",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/app/onboarding");
  });

  it("fails closed with a safe message when organization lookup fails", async () => {
    const rawError = "raw Supabase error containing tenant details";
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "authenticated-user" } },
      error: null,
    });
    mocks.getVisibleOrganizationStatus.mockResolvedValue({
      success: false,
      message: "We could not load your workspace. Please try again.",
      rawError,
    });

    const html = renderToStaticMarkup(await ApplicationPage());

    expect(mocks.redirect).not.toHaveBeenCalledWith("/app/onboarding");
    expect(html).toContain("Application unavailable");
    expect(html).toContain("We could not load your workspace. Please try again.");
    expect(html).not.toContain(rawError);
  });

  it.each([
    { data: { claims: null }, error: null },
    { data: null, error: null },
  ])("redirects when claims are missing", async (claimsResult) => {
    mocks.getClaims.mockResolvedValue(claimsResult);

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/login?next=/app",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=/app");
    expect(mocks.getVisibleOrganizationStatus).not.toHaveBeenCalled();
  });

  it("fails closed when the auth provider returns an error", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: { message: "raw provider error containing token details" },
    });

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/login?next=/app",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=/app");
    expect(mocks.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining("raw provider error"),
    );
  });

  it("fails closed when claims lookup throws", async () => {
    mocks.getClaims.mockRejectedValue(
      new Error("raw exception containing cookie details"),
    );

    await expect(ApplicationPage()).rejects.toThrow(
      "redirect:/login?next=/app",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=/app");
  });
});
