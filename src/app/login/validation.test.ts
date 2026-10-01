import { describe, expect, it } from "vitest";

import { getCallbackErrorMessage, getSafeNextPath } from "./validation";

describe("login query validation", () => {
  it("maps only verification_failed to a controlled message", () => {
    expect(getCallbackErrorMessage("verification_failed")).toBe(
      "We could not verify your account. Please try again.",
    );
    expect(getCallbackErrorMessage("raw provider error")).toBeNull();
    expect(getCallbackErrorMessage(undefined)).toBeNull();
  });

  it("accepts a local path and defaults unsafe targets to root", () => {
    expect(getSafeNextPath("/app")).toBe("/app");
    expect(getSafeNextPath("https://attacker.example")).toBe("/");
    expect(getSafeNextPath("//attacker.example")).toBe("/");
  });
});
