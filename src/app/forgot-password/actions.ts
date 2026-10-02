"use server";

import { headers } from "next/headers";

import { createClient } from "../../lib/supabase/server";
import { getRecoveryRedirectUrl } from "./validation";

export type ForgotPasswordState = {
  status: "idle" | "success" | "error";
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_RESPONSE =
  "If an account exists for that email, we sent password reset instructions.";

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function requestPasswordReset(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = getTextField(formData, "email").trim();

  if (!email || !EMAIL_PATTERN.test(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  try {
    const requestHeaders = await headers();
    const redirectTo = getRecoveryRedirectUrl(requestHeaders.get("origin"));

    if (redirectTo) {
      const supabase = await createClient();
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    }
  } catch {
    // The response remains identical so account existence cannot be inferred.
  }

  return {
    status: "success",
    message: SAFE_RESPONSE,
  };
}
