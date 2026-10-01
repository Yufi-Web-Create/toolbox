import { beforeEach, describe, expect, it, vi } from "vitest";

import { login, type LoginState } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const initialState: LoginState = {
  status: "idle",
  message: "",
};

function createLoginData(
  email?: string,
  password?: string,
  next?: string,
) {
  const formData = new FormData();

  if (email !== undefined) formData.set("email", email);
  if (password !== undefined) formData.set("password", password);
  if (next !== undefined) formData.set("next", next);

  return formData;
}

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPassword },
    });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });

  it.each(["", "invalid", "person@localhost"])(
    "rejects an invalid email: %s",
    async (email) => {
      const result = await login(
        initialState,
        createLoginData(email, "password123"),
      );

      expect(result).toEqual({
        status: "error",
        message: "Enter a valid email address.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing password without adding complexity rules", async () => {
    const result = await login(
      initialState,
      createLoginData("person@example.com", ""),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter your password.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("signs in through Supabase and redirects to the default path", async () => {
    await login(
      initialState,
      createLoginData(" person@example.com ", "password123"),
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "password123",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("uses one generic message for provider credential failures", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "user does not exist and raw provider detail" },
    });

    const result = await login(
      initialState,
      createLoginData("person@example.com", "wrong-password"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Email or password is incorrect.",
    });
    expect(result.message).not.toContain("user does not exist");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to a safe local next path", async () => {
    await login(
      initialState,
      createLoginData("person@example.com", "password123", "/app?tab=home"),
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/app?tab=home");
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
  ])("rejects an unsafe next path: %s", async (next) => {
    await login(
      initialState,
      createLoginData("person@example.com", "password123", next),
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
