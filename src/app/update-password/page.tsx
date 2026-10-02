import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  let hasAuthenticatedSession = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    hasAuthenticatedSession = !error && Boolean(data?.claims);
  } catch {
    hasAuthenticatedSession = false;
  }

  if (!hasAuthenticatedSession) {
    redirect("/forgot-password");
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <UpdatePasswordForm />
    </main>
  );
}
