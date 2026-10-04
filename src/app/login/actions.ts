"use server";

import { redirect } from "next/navigation";

import {
  internalEmailForLoginId,
  isValidLoginId,
  normalizeLoginId,
} from "../../lib/login-id";
import { createClient } from "../../lib/supabase/server";
import { getSafeNextPath } from "./validation";

export type LoginState = {
  status: "idle" | "error";
  message: string;
};

const CREDENTIAL_ERROR = "IDまたはパスワードが正しくありません。";

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const loginId = normalizeLoginId(getTextField(formData, "loginId"));
  const password = getTextField(formData, "password");

  if (!isValidLoginId(loginId)) {
    return { status: "error", message: "有効なログインIDを入力してください。" };
  }

  if (!password) {
    return { status: "error", message: "パスワードを入力してください。" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: internalEmailForLoginId(loginId),
      password,
    });

    if (error) {
      return { status: "error", message: CREDENTIAL_ERROR };
    }
  } catch {
    return { status: "error", message: CREDENTIAL_ERROR };
  }

  redirect(getSafeNextPath(getTextField(formData, "next")));
}
