const DEFAULT_REDIRECT_PATH = "/";

export function getSafeNextPath(candidate: string | null | undefined) {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const applicationOrigin = "https://application.local";
    const redirectUrl = new URL(candidate, applicationOrigin);

    if (redirectUrl.origin !== applicationOrigin) {
      return DEFAULT_REDIRECT_PATH;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

export function getCallbackErrorMessage(error: string | null | undefined) {
  return error === "verification_failed"
    ? "We could not verify your account. Please try again."
    : null;
}
