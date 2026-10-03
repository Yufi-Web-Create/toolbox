import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = !error ? data?.claims : null;

    if (!claims || typeof claims.sub !== "string") {
      return NextResponse.json({ authenticated: false });
    }

    const email = typeof claims.email === "string" ? claims.email : "";
    const metadata =
      claims.user_metadata && typeof claims.user_metadata === "object"
        ? (claims.user_metadata as Record<string, unknown>)
        : {};
    const name =
      typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : email.split("@")[0] || "スタッフ";

    return NextResponse.json({
      authenticated: true,
      user: {
        id: claims.sub,
        email,
        name,
        role: "スタッフ",
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
