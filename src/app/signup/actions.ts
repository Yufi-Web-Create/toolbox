"use server";

import { createClient } from "../../lib/supabase/server";
import { getAppOrigin } from "../../lib/app-url";

export type SignupState = {
  status: "idle" | "success" | "error";
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_PASSWORD_LENGTH = 8;

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function signup(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = getTextField(formData, "email").trim();
  const password = getTextField(formData, "password");

  if (!email || !EMAIL_PATTERN.test(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return {
      status: "error",
      message: "Password must be at least 8 characters.",
    };
  }

  try {
    const appOrigin = getAppOrigin();

    if (!appOrigin) {
      return {
        status: "error",
        message: "We could not create your account. Please try again.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appOrigin}/auth/callback?next=/login`,
      },
    });

    if (error) {
      return {
        status: "error",
        message: "We could not create your account. Please try again.",
      };
    }

    return {
      status: "success",
      message: "Check your email to verify your account before signing in.",
    };
  } catch {
    return {
      status: "error",
      message: "We could not create your account. Please try again.",
    };
  }
}
