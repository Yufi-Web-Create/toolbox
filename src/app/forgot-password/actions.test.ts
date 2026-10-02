import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const initialState: ForgotPasswordState = {
  status: "idle",
  message: "",
};

function createResetData(email?: string) {
  const formData = new FormData();

  if (email !== undefined) formData.set("email", email);

  return formData;
}

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "https://toolbox.example");
    mocks.createClient.mockResolvedValue({
      auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["", "invalid", "person@localhost"])(
    "rejects a malformed or missing email: %s",
    async (email) => {
      const result = await requestPasswordReset(
        initialState,
        createResetData(email),
      );

      expect(result).toEqual({
        status: "error",
        message: "Enter a valid email address.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("requests reset through the callback with a safe update-password target", async () => {
    const result = await requestPasswordReset(
      initialState,
      createResetData(" person@example.com "),
    );

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
      {
        redirectTo:
          "https://toolbox.example/auth/callback?next=/update-password",
      },
    );
    expect(result).toEqual({
      status: "success",
      message:
        "If an account exists for that email, we sent password reset instructions.",
    });
  });

  it("returns the same non-enumerating response for provider failures", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { message: "raw provider detail: user not found" },
    });

    const result = await requestPasswordReset(
      initialState,
      createResetData("missing@example.com"),
    );

    expect(result).toEqual({
      status: "success",
      message:
        "If an account exists for that email, we sent password reset instructions.",
    });
    expect(result.message).not.toContain("user not found");
  });

  it.each(["", "javascript:alert(1)"])(
    "keeps the response non-enumerating for invalid APP_URL: %s",
    async (appUrl) => {
      vi.stubEnv("APP_URL", appUrl);

      const result = await requestPasswordReset(
        initialState,
        createResetData("person@example.com"),
      );

      expect(result).toEqual({
        status: "success",
        message:
          "If an account exists for that email, we sent password reset instructions.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    },
  );
});
