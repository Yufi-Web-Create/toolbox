import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signup, type SignupState } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const initialState: SignupState = {
  status: "idle",
  message: "",
};

function createSignupData(email?: string, password?: string) {
  const formData = new FormData();

  if (email !== undefined) {
    formData.set("email", email);
  }

  if (password !== undefined) {
    formData.set("password", password);
  }

  return formData;
}

describe("signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "https://toolbox.example");
    mocks.createClient.mockResolvedValue({
      auth: { signUp: mocks.signUp },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["", "invalid", "person@localhost"])(
    "rejects an invalid email: %s",
    async (email) => {
      const result = await signup(
        initialState,
        createSignupData(email, "password123"),
      );

      expect(result).toEqual({
        status: "error",
        message: "Enter a valid email address.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("rejects a password shorter than eight characters", async () => {
    const result = await signup(
      initialState,
      createSignupData("person@example.com", "short"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Password must be at least 8 characters.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("submits valid credentials and returns the verification instruction", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: {} }, error: null });

    const result = await signup(
      initialState,
      createSignupData(" person@example.com ", "password123"),
    );

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "password123",
      options: {
        emailRedirectTo:
          "https://toolbox.example/auth/callback?next=/login",
      },
    });
    expect(result).toEqual({
      status: "success",
      message: "Check your email to verify your account before signing in.",
    });
  });

  it("returns a safe message for provider errors", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "raw provider detail with token" },
    });

    const result = await signup(
      initialState,
      createSignupData("person@example.com", "password123"),
    );

    expect(result).toEqual({
      status: "error",
      message: "We could not create your account. Please try again.",
    });
    expect(result.message).not.toContain("raw provider detail");
  });

  it.each(["", "https://toolbox.example/path"])(
    "fails closed with a safe message for invalid APP_URL: %s",
    async (appUrl) => {
      vi.stubEnv("APP_URL", appUrl);

      const result = await signup(
        initialState,
        createSignupData("person@example.com", "password123"),
      );

      expect(result).toEqual({
        status: "error",
        message: "We could not create your account. Please try again.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.signUp).not.toHaveBeenCalled();
    },
  );
});
