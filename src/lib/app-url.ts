export function normalizeAppOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const applicationUrl = new URL(value);

    if (
      applicationUrl.protocol !== "https:" &&
      applicationUrl.protocol !== "http:"
    ) {
      return null;
    }

    if (applicationUrl.href !== `${applicationUrl.origin}/`) {
      return null;
    }

    return applicationUrl.origin;
  } catch {
    return null;
  }
}

export function getAppOrigin(): string | null {
  return normalizeAppOrigin(process.env.APP_URL);
}
