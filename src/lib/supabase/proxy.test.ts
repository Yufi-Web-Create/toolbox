import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "./proxy";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

type CookieBatch = Array<{
  name: string;
  value: string;
  options: CookieOptions;
}>;

type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: CookieBatch, headers: Record<string, string>): void;
};

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "test-publishable-key",
    );
  });

  it("forwards request cookies and writes refreshed cookies and headers", async () => {
    let forwardedCookies: Array<{ name: string; value: string }> = [];

    mocks.createServerClient.mockImplementation(
      (
        _url: string,
        _publishableKey: string,
        options: { cookies: CookieAdapter },
      ) => {
        forwardedCookies = options.cookies.getAll();
        mocks.getClaims.mockImplementation(async () => {
          options.cookies.setAll(
            [
              {
                name: "session-cookie",
                value: "refreshed-value",
                options: { path: "/", httpOnly: true },
              },
            ],
            { "Cache-Control": "private, no-store" },
          );

          return { data: { claims: { sub: "user-id" } }, error: null };
        });

        return { auth: { getClaims: mocks.getClaims } };
      },
    );

    const request = new NextRequest("https://example.test/app", {
      headers: { cookie: "existing-cookie=existing-value" },
    });

    const response = await updateSession(request);

    expect(forwardedCookies).toEqual([
      { name: "existing-cookie", value: "existing-value" },
    ]);
    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(request.cookies.get("session-cookie")?.value).toBe(
      "refreshed-value",
    );
    expect(response.cookies.get("session-cookie")?.value).toBe(
      "refreshed-value",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns a continuing response without redirecting", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: null,
    });
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims },
    });

    const response = await updateSession(
      new NextRequest("https://example.test/public"),
    );

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
