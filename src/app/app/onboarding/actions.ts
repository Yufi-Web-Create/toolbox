"use server";

import { redirect } from "next/navigation";

import { createOrganizationWithOwner } from "../../../lib/organizations/server";
import { createClient } from "../../../lib/supabase/server";

export type OnboardingState = {
  status: "idle" | "error";
  message: string;
};

const LOGIN_REDIRECT = "/login?next=/app/onboarding";
const CREATE_ORGANIZATION_ERROR_MESSAGE =
  "We could not create your organization. Please try again.";

function getOrganizationName(formData: FormData) {
  const value = formData.get("organizationName");

  return typeof value === "string" ? value.trim() : "";
}

export async function createOrganization(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = getOrganizationName(formData);

  if (!name) {
    return {
      status: "error",
      message: "Enter an organization name.",
    };
  }

  let claims = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (!error) {
      claims = data?.claims ?? null;
    }
  } catch {
    claims = null;
  }

  if (!claims) {
    redirect(LOGIN_REDIRECT);
  }

  const result = await createOrganizationWithOwner(name);

  if (!result.success) {
    return {
      status: "error",
      message: CREATE_ORGANIZATION_ERROR_MESSAGE,
    };
  }

  redirect("/app");
}
