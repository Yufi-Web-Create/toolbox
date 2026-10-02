"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

export async function logout() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // The destination is intentionally the same for every logout outcome.
  }

  redirect("/login");
}
