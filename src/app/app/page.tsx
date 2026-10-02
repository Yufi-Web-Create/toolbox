import { redirect } from "next/navigation";

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

  return (
    <main>
      <h1>Application</h1>
      <p>You are signed in.</p>
    </main>
  );
}
