import Link from "next/link";
import { redirect } from "next/navigation";

import { getVisibleOrganizationStatus } from "../../lib/organizations/server";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

const LOGIN_REDIRECT = "/login?next=/app";

export default async function ApplicationPage() {
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
        <h1>Application unavailable</h1>
        <p>{organizationStatus.message}</p>
      </main>
    );
  }

  if (!organizationStatus.hasOrganization) {
    redirect("/app/onboarding");
  }

  return (
    <main>
      <h1>Application</h1>
      <p>You are signed in.</p>
      <Link href="/app/inbox">LINE受信箱を開く</Link>
    </main>
  );
}
