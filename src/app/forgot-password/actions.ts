"use server";

import { getAppOrigin } from "../../lib/app-url";
import { createClient } from "../../lib/supabase/server";

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
    const appOrigin = getAppOrigin();

    if (appOrigin) {
      const supabase = await createClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appOrigin}/auth/callback?next=/update-password`,
      });
    }
  } catch {
    // The response remains identical so account existence cannot be inferred.
  }

  return {
    status: "success",
    message: SAFE_RESPONSE,
  };
}
