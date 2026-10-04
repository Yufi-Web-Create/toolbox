import { afterEach, describe, expect, it } from "vitest";

import {
  createMasterSessionValue,
  isMasterConfigured,
  verifyMasterPassword,
  verifyMasterSessionValue,
} from "./master-auth";

const originalPassword = process.env.OMNIBOX_MASTER_PASSWORD;

afterEach(() => {
  if (originalPassword === undefined) {
    delete process.env.OMNIBOX_MASTER_PASSWORD;
  } else {
    process.env.OMNIBOX_MASTER_PASSWORD = originalPassword;
  }
});

describe("master authentication helpers", () => {
  it("keeps master access disabled when no deployment secret exists", () => {
    delete process.env.OMNIBOX_MASTER_PASSWORD;
    expect(isMasterConfigured()).toBe(false);
    expect(verifyMasterPassword("anything")).toBe(false);
    expect(createMasterSessionValue()).toBe("");
  });

  it("verifies the configured password without exposing it to the client", () => {
    process.env.OMNIBOX_MASTER_PASSWORD = "test-password-only";
    expect(isMasterConfigured()).toBe(true);
    expect(verifyMasterPassword("test-password-only")).toBe(true);
    expect(verifyMasterPassword("wrong-password")).toBe(false);
  });

  it("creates an expiring signed master session", () => {
    process.env.OMNIBOX_MASTER_PASSWORD = "test-password-only";
    const now = 1_800_000_000_000;
    const session = createMasterSessionValue(now);

    expect(verifyMasterSessionValue(session, now + 60_000)).toBe(true);
    expect(verifyMasterSessionValue(session, now + 9 * 60 * 60 * 1000)).toBe(false);
    expect(verifyMasterSessionValue(session + "tampered", now)).toBe(false);
  });
});
