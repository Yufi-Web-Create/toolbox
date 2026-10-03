import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Always return the same safe response.
  }

  return NextResponse.json({ ok: true });
}
