import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";

const DEFAULT_REDIRECT_PATH = "/login";
const VERIFICATION_ERROR = "verification_failed";

function getFailureUrl(requestUrl: URL) {
  const failureUrl = new URL(DEFAULT_REDIRECT_PATH, requestUrl.origin);
  failureUrl.searchParams.set("error", VERIFICATION_ERROR);

  return failureUrl;
}

export function getSafeRedirectPath(
  candidate: string | null,
  applicationOrigin: string,
) {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const redirectUrl = new URL(candidate, applicationOrigin);

    if (redirectUrl.origin !== applicationOrigin) {
      return DEFAULT_REDIRECT_PATH;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(getFailureUrl(requestUrl));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(getFailureUrl(requestUrl));
    }

    const redirectPath = getSafeRedirectPath(
      requestUrl.searchParams.get("next"),
      requestUrl.origin,
    );

    return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
  } catch {
    return NextResponse.redirect(getFailureUrl(requestUrl));
  }
}
