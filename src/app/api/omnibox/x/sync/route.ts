import { NextResponse } from "next/server";

// X is a publishing-only integration. Disable the legacy DM sync, Chat XDK
// decryption and send/import APIs. X publishing uses separate routes.
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "Xは投稿専用です。DMの送受信は利用できません。" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
