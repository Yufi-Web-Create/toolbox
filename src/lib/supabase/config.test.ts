import { describe, expect, it } from "vitest";

import { getSupabaseConfig } from "./config";

describe("getSupabaseConfig", () => {
  it("returns controlled configuration values", () => {
    expect(
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "test-publishable-key",
    });
  });

  it("fails clearly when the URL is absent", () => {
    expect(() =>
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }),
    ).toThrow(
      "Missing required Supabase environment variable: NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("fails clearly when the publishable key is absent", () => {
    expect(() =>
      getSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow(
      "Missing required Supabase environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });
});
