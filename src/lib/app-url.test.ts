import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppOrigin, normalizeAppOrigin } from "./app-url";

describe("normalizeAppOrigin", () => {
  it.each([
    ["https://toolbox.example", "https://toolbox.example"],
    ["https://toolbox.example/", "https://toolbox.example"],
    ["http://localhost:3000", "http://localhost:3000"],
  ])("accepts and normalizes an origin: %s", (value, expected) => {
    expect(normalizeAppOrigin(value)).toBe(expected);
  });

  const invalidAppUrls: Array<string | undefined> = [
    undefined,
    "not a URL",
    "https://toolbox.example/auth",
    "https://toolbox.example/?next=/app",
    "https://toolbox.example/#section",
    "ftp://toolbox.example",
  ];

  it.each(invalidAppUrls)("rejects an invalid origin: %s", (value) => {
    expect(normalizeAppOrigin(value)).toBeNull();
  });
});

describe("getAppOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads and validates APP_URL from the server environment", () => {
    vi.stubEnv("APP_URL", "https://toolbox.example/");

    expect(getAppOrigin()).toBe("https://toolbox.example");
  });

  it("fails closed when APP_URL is missing", () => {
    vi.stubEnv("APP_URL", "");

    expect(getAppOrigin()).toBeNull();
  });
});
