"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { getSafeNextPath } from "./validation";

export type LoginState = {
  status: "idle" | "error";
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CREDENTIAL_ERROR = "Email or password is incorrect.";

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = getTextField(formData, "email").trim();
  const password = getTextField(formData, "password");

  if (!email || !EMAIL_PATTERN.test(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if (!password) {
    return {
      status: "error",
      message: "Enter your password.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        status: "error",
        message: CREDENTIAL_ERROR,
      };
    }
  } catch {
    return {
      status: "error",
      message: CREDENTIAL_ERROR,
    };
  }

  redirect(getSafeNextPath(getTextField(formData, "next")));
}
