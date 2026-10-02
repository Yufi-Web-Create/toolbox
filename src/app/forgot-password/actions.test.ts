import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  headers: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
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
    mocks.headers.mockResolvedValue(
      new Headers({ origin: "https://toolbox.example" }),
    );
    mocks.createClient.mockResolvedValue({
      auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
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
});
