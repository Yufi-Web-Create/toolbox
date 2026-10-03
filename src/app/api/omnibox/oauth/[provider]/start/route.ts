import { NextResponse } from "next/server";

import {
  buildAuthorizeUrl,
  createOAuthState,
  createPkcePair,
  getProviderConfig,
  isOAuthProvider,
} from "../../../../../../lib/integrations/oauth/providers";
import { createClient } from "../../../../../../lib/supabase/server";

type Context = { params: Promise<{ provider: string }> };

function returnUrl(request: Request, provider: string, error: string) {
  const origin = new URL(request.url).origin;
  const url = new URL("/omnibox.html", origin);
  url.searchParams.set("oauth_error", error);
  url.searchParams.set("provider", provider);
  return url;
}

export async function GET(request: Request, context: Context) {
  const { provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.redirect(returnUrl(request, rawProvider, "unsupported_provider"));
  }

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId =
    !claimsError && typeof claims?.claims?.sub === "string"
      ? claims.claims.sub
      : null;

  if (!userId) {
    return NextResponse.redirect(returnUrl(request, rawProvider, "login_required"));
  }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .limit(1);

  if (
    !Array.isArray(memberships) ||
    memberships.length !== 1 ||
    memberships[0].role !== "owner"
  ) {
    return NextResponse.redirect(returnUrl(request, rawProvider, "owner_required"));
  }

  const origin = new URL(request.url).origin;
  const config = getProviderConfig(rawProvider, origin);
  if (!config) {
    return NextResponse.redirect(
      returnUrl(request, rawProvider, "provider_not_configured"),
    );
  }

  const state = createOAuthState();
  const { verifier, challenge } = createPkcePair();
  const authorizeUrl = buildAuthorizeUrl(config, state, challenge);
  const response = NextResponse.redirect(authorizeUrl);

  const secure = origin.startsWith("https://");
  response.cookies.set(`omnibox_oauth_state_${rawProvider}`, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: `/api/omnibox/oauth/${rawProvider}`,
    maxAge: 10 * 60,
  });
  response.cookies.set(`omnibox_oauth_verifier_${rawProvider}`, verifier, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: `/api/omnibox/oauth/${rawProvider}`,
    maxAge: 10 * 60,
  });

  return response;
}
