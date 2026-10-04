"use server";

import { redirect } from "next/navigation";

import {
  setMasterSessionCookie,
  verifyMasterPassword,
} from "../../lib/master-auth";

export type MasterLoginState = {
  status: "idle" | "error";
  message: string;
};

export async function masterLogin(
  _previousState: MasterLoginState,
  formData: FormData,
): Promise<MasterLoginState> {
  const value = formData.get("password");
  const password = typeof value === "string" ? value : "";

  if (!verifyMasterPassword(password)) {
    return {
      status: "error",
      message: "マスターパスワードが正しくありません。",
    };
  }

  try {
    await setMasterSessionCookie();
  } catch {
    return {
      status: "error",
      message: "マスターログインが設定されていません。",
    };
  }

  redirect("/master");
}
