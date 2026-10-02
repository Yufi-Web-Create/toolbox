import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UpdatePasswordPage from "./page";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("/update-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });
  });

  it("renders the form when authenticated claims exist", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "recovery-user" } },
      error: null,
    });

    const html = renderToStaticMarkup(await UpdatePasswordPage());

    expect(html).toContain("Choose a new password");
    expect(html).toContain('type="password"');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects when recovery authentication is missing", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });

    await expect(UpdatePasswordPage()).rejects.toThrow(
      "redirect:/forgot-password",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/forgot-password");
  });

  it("fails closed when the claims provider fails", async () => {
    mocks.getClaims.mockRejectedValue(new Error("raw provider failure"));

    await expect(UpdatePasswordPage()).rejects.toThrow(
      "redirect:/forgot-password",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/forgot-password");
  });
});
