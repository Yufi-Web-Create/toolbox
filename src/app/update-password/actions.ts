"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

export type UpdatePasswordState = {
  status: "idle" | "error";
  message: string;
};

const MINIMUM_PASSWORD_LENGTH = 8;
const SESSION_ERROR =
  "Your password reset session is no longer valid. Request a new reset link.";
const UPDATE_ERROR = "We could not update your password. Please try again.";

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function updatePassword(
  _previousState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = getTextField(formData, "password");

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return {
      status: "error",
      message: "Password must be at least 8 characters.",
    };
  }

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims) {
      return {
        status: "error",
        message: SESSION_ERROR,
      };
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      return {
        status: "error",
        message: UPDATE_ERROR,
      };
    }
  } catch {
    return {
      status: "error",
      message: UPDATE_ERROR,
    };
  }

  redirect("/login");
}
