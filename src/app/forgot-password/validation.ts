export function getRecoveryRedirectUrl(origin: string | null) {
  if (!origin) {
    return null;
  }

  try {
    const applicationUrl = new URL(origin);

    if (applicationUrl.protocol !== "https:" && applicationUrl.protocol !== "http:") {
      return null;
    }

    return new URL(
      "/auth/callback?next=/update-password",
      applicationUrl.origin,
    ).toString();
  } catch {
    return null;
  }
}
