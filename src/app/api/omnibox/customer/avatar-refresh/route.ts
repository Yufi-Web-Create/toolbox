import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims?.sub) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!accessToken) return NextResponse.json({ ok: false }, { status: 401 });
  let conversationId = "";
  try {
    const body = await request.json();
    conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!/^[a-f0-9-]{36}$/i.test(conversationId)) return NextResponse.json({ ok: false }, { status: 400 });
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 503 });
  try {
    const result = await fetch(endpoint + "/functions/v1/omnibox-customer-avatar-refresh", {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
      body: JSON.stringify({ conversationId }), cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return NextResponse.json(await result.json(), { status: result.status });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
