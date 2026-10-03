import { NextResponse } from "next/server";

import {
  getProviderConfig,
  type OAuthProvider,
} from "../../../../../lib/integrations/oauth/providers";
import { createClient } from "../../../../../lib/supabase/server";

const OAUTH_PROVIDERS: OAuthProvider[] = ["instagram", "x", "google"];

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claims?.claims?.sub !== "string") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { data, error } = await supabase.rpc(
      "omnibox_list_provider_connections",
    );

    if (error || !Array.isArray(data)) {
      return NextResponse.json(
        { ok: false, message: "連携アカウントを読み込めませんでした。" },
        { status: 500 },
      );
    }

    const origin = new URL(request.url).origin;
    const providers = Object.fromEntries(
      OAUTH_PROVIDERS.map((provider) => [
        provider,
        { configured: Boolean(getProviderConfig(provider, origin)) },
      ]),
    );

    return NextResponse.json({
      ok: true,
      connections: data,
      providers,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "連携アカウントを読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json();
    const connectionId =
      typeof payload?.connectionId === "string"
        ? payload.connectionId.trim()
        : "";

    if (!connectionId) {
      return NextResponse.json(
        { ok: false, message: "連携アカウントを確認できません。" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();

    if (claimsError || typeof claims?.claims?.sub !== "string") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { data, error } = await supabase.rpc(
      "omnibox_delete_provider_connection",
      { p_connection_id: connectionId },
    );

    if (error || data !== true) {
      return NextResponse.json(
        { ok: false, message: "連携を解除できませんでした。" },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "連携を解除できませんでした。" },
      { status: 500 },
    );
  }
}
