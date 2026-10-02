type AuthenticationMethodReference = {
  method?: unknown;
};

type ClaimsWithAuthenticationMethods = {
  amr?: unknown;
};

export function hasRecoveryAuthentication(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;

  const { amr } = claims as ClaimsWithAuthenticationMethods;

  return (
    Array.isArray(amr) &&
    amr.some(
      (entry: unknown) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as AuthenticationMethodReference).method === "recovery",
    )
  );
}
