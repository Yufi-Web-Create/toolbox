import { beforeEach, describe, expect, it, vi } from "vitest";

import { updatePassword, type UpdatePasswordState } from "./actions";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  redirect: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const initialState: UpdatePasswordState = {
  status: "idle",
  message: "",
};

function createPasswordData(password?: string) {
  const formData = new FormData();

  if (password !== undefined) formData.set("password", password);

  return formData;
}

describe("updatePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: mocks.getClaims,
        updateUser: mocks.updateUser,
      },
    });
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "recovery-user",
          amr: [{ method: "recovery", timestamp: 1 }],
        },
      },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it.each(["", "short", "1234567"])(
    "rejects a password shorter than eight characters",
    async (password) => {
      const result = await updatePassword(
        initialState,
        createPasswordData(password),
      );

      expect(result).toEqual({
        status: "error",
        message: "Password must be at least 8 characters.",
      });
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("updates a valid password and redirects to login", async () => {
    await updatePassword(initialState, createPasswordData("new-password"));

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "new-password",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("fails closed when authenticated claims are missing", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const result = await updatePassword(
      initialState,
      createPasswordData("new-password"),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Your password reset session is no longer valid. Request a new reset link.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects ordinary password-authenticated claims", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "password-user",
          amr: [{ method: "password", timestamp: 1 }],
        },
      },
      error: null,
    });

    const result = await updatePassword(
      initialState,
      createPasswordData("new-password"),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Your password reset session is no longer valid. Request a new reset link.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects provider errors while checking recovery claims", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "recovery-user",
          amr: [{ method: "recovery", timestamp: 1 }],
        },
      },
      error: { message: "raw provider error containing token details" },
    });

    const result = await updatePassword(
      initialState,
      createPasswordData("new-password"),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Your password reset session is no longer valid. Request a new reset link.",
    });
    expect(result.message).not.toContain("raw provider error");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("uses a safe message for provider update failures", async () => {
    mocks.updateUser.mockResolvedValue({
      error: { message: "raw provider error containing token details" },
    });

    const result = await updatePassword(
      initialState,
      createPasswordData("new-password"),
    );

    expect(result).toEqual({
      status: "error",
      message: "We could not update your password. Please try again.",
    });
    expect(result.message).not.toContain("raw provider error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
