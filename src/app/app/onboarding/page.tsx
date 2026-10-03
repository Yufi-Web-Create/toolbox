import { redirect } from "next/navigation";

import { getVisibleOrganizationStatus } from "../../../lib/organizations/server";
import { createClient } from "../../../lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

const LOGIN_REDIRECT = "/login?next=/app/onboarding";

export default async function OnboardingPage() {
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

  const organizationStatus = await getVisibleOrganizationStatus();

  if (!organizationStatus.success) {
    return (
      <main>
        <h1>Workspace setup unavailable</h1>
        <p>{organizationStatus.message}</p>
      </main>
    );
  }

  if (organizationStatus.hasOrganization) {
    redirect("/app");
  }

  return (
    <main>
      <h1>Set up your workspace</h1>
      <p>Enter an organization name to create your workspace.</p>
      <OnboardingForm />
    </main>
  );
}
