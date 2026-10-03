"use server";

import { createClient } from "../supabase/server";

export type CreateOrganizationResult =
  | { success: true; organizationId: string }
  | { success: false; message: string };

const CREATE_ORGANIZATION_ERROR_MESSAGE =
  "We could not create your organization. Please try again.";

export async function createOrganizationWithOwner(
  name: string,
): Promise<CreateOrganizationResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "create_organization_with_owner",
      { p_name: name },
    );

    if (error || typeof data !== "string") {
      return {
        success: false,
        message: CREATE_ORGANIZATION_ERROR_MESSAGE,
      };
    }

    return { success: true, organizationId: data };
  } catch {
    return {
      success: false,
      message: CREATE_ORGANIZATION_ERROR_MESSAGE,
    };
  }
}
