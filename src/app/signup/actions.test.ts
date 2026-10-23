import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signup, type SignupState } from "./actions";
const { signInWithPassword, redirectMock } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  redirectMock: vi.fn(),
}));
vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword } }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const initialState: SignupState = {
  status: "idle",
  message: "",
};

function createSignupData(
  name?: string,
  loginId?: string,
  password?: string,
) {
  const formData = new FormData();
  if (name !== undefined) formData.set("name", name);
  if (loginId !== undefined) formData.set("loginId", loginId);
  if (password !== undefined) formData.set("password", password);
  return formData;
}

describe("signup", () => {
  beforeEach(() => {
    signInWithPassword.mockReset().mockResolvedValue({ error: null });
    redirectMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a missing display name", async () => {
    const result = await signup(
      initialState,
      createSignupData("", "owner01", "password123"),
    );
    expect(result).toEqual({
      status: "error",
      message: "表示名を入力してください。",
    });
  });

  it.each(["", "a", "ab", "@invalid"])(
    "rejects an invalid login ID: %s",
    async (loginId) => {
      const result = await signup(
        initialState,
        createSignupData("Owner", loginId, "password123"),
      );
      expect(result.status).toBe("error");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects a short password", async () => {
    const result = await signup(
      initialState,
      createSignupData("Owner", "owner01", "short"),
    );
    expect(result).toEqual({
      status: "error",
      message: "パスワードは8文字以上で入力してください。",
    });
  });

  it("creates an account through the ID signup edge function", async () => {
    const result = await signup(
      initialState,
      createSignupData("Owner", " Owner01 ", "password123"),
    );

    expect(fetch).toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: expect.any(String),
      password: "password123",
    });
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("reports a duplicate login ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "login_id_taken" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await signup(
      initialState,
      createSignupData("Owner", "owner01", "password123"),
    );

    expect(result).toEqual({
      status: "error",
      message: "そのIDはすでに使用されています。別のIDを入力してください。",
    });
  });
});
