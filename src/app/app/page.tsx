import { redirect } from "next/navigation";

import { getVisibleOrganizationStatus } from "../../lib/organizations/server";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ApplicationPage() {
  let authenticated = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && Boolean(data?.claims);
  } catch {
    authenticated = false;
  }

  if (!authenticated) {
    redirect("/login?next=/app/inbox");
  }

  const organizationStatus = await getVisibleOrganizationStatus();

  if (!organizationStatus.success) {
    redirect("/app/inbox");
  }

  if (!organizationStatus.hasOrganization) {
    redirect("/app/onboarding");
  }

  redirect("/app/inbox");
}
