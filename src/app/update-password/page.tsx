import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { hasRecoveryAuthentication } from "./recovery-session";
import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  let hasRecoverySession = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    hasRecoverySession = !error && hasRecoveryAuthentication(data?.claims);
  } catch {
    hasRecoverySession = false;
  }

  if (!hasRecoverySession) {
    redirect("/forgot-password");
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <UpdatePasswordForm />
    </main>
  );
}
