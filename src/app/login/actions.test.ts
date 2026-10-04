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
  loginId?: string,
  password?: string,
  next?: string,
) {
  const formData = new FormData();
  if (loginId !== undefined) formData.set("loginId", loginId);
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

  it.each(["", "a", "ab", "@invalid"])(
    "rejects an invalid login ID: %s",
    async (loginId) => {
      const result = await login(
        initialState,
        createLoginData(loginId, "password123"),
      );

      expect(result).toEqual({
        status: "error",
        message: "有効なログインIDを入力してください。",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing password", async () => {
    const result = await login(
      initialState,
      createLoginData("staff01", ""),
    );

    expect(result).toEqual({
      status: "error",
      message: "パスワードを入力してください。",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("maps the normalized ID to the internal Supabase email", async () => {
    await login(
      initialState,
      createLoginData(" Staff01 ", "password123"),
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "staff01@login.omnibox.app",
      password: "password123",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("uses one generic message for provider credential failures", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "raw provider detail" },
    });

    const result = await login(
      initialState,
      createLoginData("staff01", "wrong-password"),
    );

    expect(result).toEqual({
      status: "error",
      message: "IDまたはパスワードが正しくありません。",
    });
    expect(result.message).not.toContain("raw provider detail");
  });

  it("redirects to a safe local next path", async () => {
    await login(
      initialState,
      createLoginData("staff01", "password123", "/app?tab=home"),
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/app?tab=home");
  });
});
