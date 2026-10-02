import { beforeEach, describe, expect, it, vi } from "vitest";

import { logout } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { signOut: mocks.signOut },
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("signs out through the existing server client and redirects to login", async () => {
    await logout();

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith();
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects safely when the provider returns a sign-out error", async () => {
    const providerError = {
      message: "raw provider error containing session details",
    };
    mocks.signOut.mockResolvedValue({ error: providerError });

    const result = await logout();

    expect(result).toBeUndefined();
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining(providerError.message),
    );
  });

  it("redirects safely when sign-out throws unexpectedly", async () => {
    mocks.signOut.mockRejectedValue(
      new Error("raw exception containing token and cookie details"),
    );

    await logout();

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
