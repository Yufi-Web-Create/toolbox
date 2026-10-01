import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

function callbackRequest(query = "") {
  return new Request(`https://toolbox.example/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("redirects a missing code to a controlled failure state", async () => {
    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toBe(
      "https://toolbox.example/login?error=verification_failed",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("exchanges the code and redirects successful verification to login", async () => {
    const response = await GET(callbackRequest("?code=verification-code"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith(
      "verification-code",
    );
    expect(response.headers.get("location")).toBe(
      "https://toolbox.example/login",
    );
  });

  it("does not expose provider errors when code exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "raw provider error containing a token" },
    });

    const response = await GET(callbackRequest("?code=invalid-code"));
    const location = response.headers.get("location");

    expect(location).toBe(
      "https://toolbox.example/login?error=verification_failed",
    );
    expect(location).not.toContain("raw provider error");
    expect(location).not.toContain("invalid-code");
  });

  it("accepts a safe local redirect after successful exchange", async () => {
    const response = await GET(
      callbackRequest("?code=valid-code&next=%2Faccount%3Ftab%3Dprofile"),
    );

    expect(response.headers.get("location")).toBe(
      "https://toolbox.example/account?tab=profile",
    );
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
  ])("rejects an unsafe redirect target: %s", async (redirectTarget) => {
    const query = new URLSearchParams({
      code: "valid-code",
      next: redirectTarget,
    });
    const response = await GET(callbackRequest(`?${query.toString()}`));

    expect(response.headers.get("location")).toBe(
      "https://toolbox.example/login",
    );
  });
});
