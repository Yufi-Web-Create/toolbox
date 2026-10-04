"use server";

import {
  isValidLoginId,
  normalizeLoginId,
} from "../../lib/login-id";

export type SignupState = {
  status: "idle" | "success" | "error";
  message: string;
};

const MINIMUM_PASSWORD_LENGTH = 8;

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signup(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = getTextField(formData, "name").trim();
  const loginId = normalizeLoginId(getTextField(formData, "loginId"));
  const password = getTextField(formData, "password");

  if (!name) {
    return { status: "error", message: "表示名を入力してください。" };
  }

  if (!isValidLoginId(loginId)) {
    return {
      status: "error",
      message: "IDは3〜32文字の半角英数字・ピリオド・ハイフン・アンダースコアで入力してください。",
    };
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return { status: "error", message: "パスワードは8文字以上で入力してください。" };
  }

  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!base) {
      return { status: "error", message: "アカウントを作成できませんでした。" };
    }

    const response = await fetch(new URL("/functions/v1/omnibox-id-signup", base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, loginId, password }),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || result.ok !== true) {
      return {
        status: "error",
        message:
          result.error === "login_id_taken"
            ? "そのIDはすでに使用されています。別のIDを入力してください。"
            : "アカウントを作成できませんでした。入力内容をご確認ください。",
      };
    }

    return {
      status: "success",
      message: "アカウントを作成しました。IDとパスワードでログインできます。",
    };
  } catch {
    return { status: "error", message: "アカウントを作成できませんでした。" };
  }
}
