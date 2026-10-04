import { createHash, randomBytes } from "node:crypto";

export type OAuthProvider = "instagram" | "x" | "google";

export type ProviderConfig = {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
};

type TokenBundle = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
};

export type OAuthAccount = {
  externalAccountId: string;
  accountName: string;
  handle: string;
  avatarUrl: string | null;
  tokenBundle: TokenBundle;
  scopes: string[];
  expiresAt: string | null;
  metadata: Record<string, unknown>;
};

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function scopeEnv(name: string, fallback: string[]) {
  const raw = process.env[name]?.trim();
  return raw
    ? raw.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean)
    : fallback;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "instagram" || value === "x" || value === "google";
}

export function providerLabel(provider: OAuthProvider) {
  if (provider === "instagram") return "Instagram";
  if (provider === "x") return "X";
  return "Google / Gmail";
}

export function getProviderConfig(
  provider: OAuthProvider,
  origin: string,
): ProviderConfig | null {
  const redirectUri = `${origin}/api/omnibox/oauth/${provider}/callback`;

  if (provider === "instagram") {
    const clientId = env("OMNIBOX_INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_ID");
    const clientSecret = env(
      "OMNIBOX_INSTAGRAM_CLIENT_SECRET",
      "INSTAGRAM_CLIENT_SECRET",
    );
    if (!clientId || !clientSecret) return null;

    return {
      provider,
      clientId,
      clientSecret,
      authorizeUrl: "https://www.instagram.com/oauth/authorize",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: scopeEnv("OMNIBOX_INSTAGRAM_SCOPES", [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_content_publish",
      ]),
      redirectUri,
    };
  }

  if (provider === "x") {
    const clientId = env("OMNIBOX_X_CLIENT_ID", "X_CLIENT_ID");
    const clientSecret = env("OMNIBOX_X_CLIENT_SECRET", "X_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;

    return {
      provider,
      clientId,
      clientSecret,
      authorizeUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      scopes: scopeEnv("OMNIBOX_X_SCOPES", [
        "tweet.read",
        "tweet.write",
        "users.read",
        "dm.read",
        "dm.write",
        "offline.access",
      ]),
      redirectUri,
    };
  }

  const clientId = env("OMNIBOX_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
  const clientSecret = env(
    "OMNIBOX_GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
  );
  if (!clientId || !clientSecret) return null;

  return {
    provider,
    clientId,
    clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: scopeEnv("OMNIBOX_GOOGLE_SCOPES", [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ]),
    redirectUri,
  };
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  config: ProviderConfig,
  state: string,
  challenge: string,
) {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);

  if (config.provider === "instagram") {
    url.searchParams.set("scope", config.scopes.join(","));
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
  } else if (config.provider === "x") {
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  } else {
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url;
}

function expiresAt(expiresIn: unknown) {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function jsonResponse(response: Response) {
  const data = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok || !data) {
    throw new Error("provider_request_failed");
  }
  return data;
}

async function exchangeInstagram(
  config: ProviderConfig,
  code: string,
): Promise<OAuthAccount> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });

  const shortResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const short = await jsonResponse(shortResponse);
  const shortToken =
    typeof short.access_token === "string" ? short.access_token : "";
  if (!shortToken) throw new Error("instagram_token_missing");

  let tokenBundle: TokenBundle = {
    access_token: shortToken,
    expires_in:
      typeof short.expires_in === "number" ? short.expires_in : undefined,
    token_type: "bearer",
  };

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", config.clientSecret);
  longUrl.searchParams.set("access_token", shortToken);

  const longResponse = await fetch(longUrl, { cache: "no-store" });
  if (longResponse.ok) {
    const long = (await longResponse.json()) as Record<string, unknown>;
    if (typeof long.access_token === "string") {
      tokenBundle = {
        ...tokenBundle,
        access_token: long.access_token,
        expires_in:
          typeof long.expires_in === "number"
            ? long.expires_in
            : tokenBundle.expires_in,
        token_type:
          typeof long.token_type === "string"
            ? long.token_type
            : tokenBundle.token_type,
      };
    }
  }

  const profileUrl = new URL("https://graph.instagram.com/me");
  profileUrl.searchParams.set(
    "fields",
    "id,user_id,username,name,profile_picture_url",
  );
  profileUrl.searchParams.set("access_token", tokenBundle.access_token);
  const profile = await jsonResponse(
    await fetch(profileUrl, { cache: "no-store" }),
  );

  const externalAccountId = String(profile.user_id ?? profile.id ?? "");
  const username = String(profile.username ?? "");
  const accountName = String(profile.name ?? username ?? "Instagram");

  if (!externalAccountId) throw new Error("instagram_profile_missing");

  return {
    externalAccountId,
    accountName: accountName || "Instagram",
    handle: username ? `@${username}` : "",
    avatarUrl:
      typeof profile.profile_picture_url === "string"
        ? profile.profile_picture_url
        : null,
    tokenBundle,
    scopes: config.scopes,
    expiresAt: expiresAt(tokenBundle.expires_in),
    metadata: {
      avatar_url:
        typeof profile.profile_picture_url === "string"
          ? profile.profile_picture_url
          : null,
    },
  };
}

async function exchangeX(
  config: ProviderConfig,
  code: string,
  verifier: string,
): Promise<OAuthAccount> {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
          "base64",
        ),
    },
    body,
    cache: "no-store",
  });

  const token = (await jsonResponse(response)) as TokenBundle;
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("x_token_missing");
  }

  const profile = await jsonResponse(
    await fetch(
      "https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        cache: "no-store",
      },
    ),
  );

  const data =
    profile.data && typeof profile.data === "object"
      ? (profile.data as Record<string, unknown>)
      : {};
  const externalAccountId = String(data.id ?? "");
  const username = String(data.username ?? "");
  const accountName = String(data.name ?? username ?? "X");

  if (!externalAccountId) throw new Error("x_profile_missing");

  return {
    externalAccountId,
    accountName: accountName || "X",
    handle: username ? `@${username}` : "",
    avatarUrl:
      typeof data.profile_image_url === "string" ? data.profile_image_url : null,
    tokenBundle: token,
    scopes:
      typeof token.scope === "string"
        ? token.scope.split(/\s+/).filter(Boolean)
        : config.scopes,
    expiresAt: expiresAt(token.expires_in),
    metadata: {
      avatar_url:
        typeof data.profile_image_url === "string"
          ? data.profile_image_url
          : null,
    },
  };
}

async function exchangeGoogle(
  config: ProviderConfig,
  code: string,
  verifier: string,
): Promise<OAuthAccount> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const token = (await jsonResponse(
    await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    }),
  )) as TokenBundle;

  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("google_token_missing");
  }

  const profile = await jsonResponse(
    await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    }),
  );

  const externalAccountId = String(profile.sub ?? "");
  const email = String(profile.email ?? "");
  const accountName = String(profile.name ?? email ?? "Google / Gmail");

  if (!externalAccountId) throw new Error("google_profile_missing");

  return {
    externalAccountId,
    accountName: accountName || "Google / Gmail",
    handle: email,
    avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
    tokenBundle: token,
    scopes:
      typeof token.scope === "string"
        ? token.scope.split(/\s+/).filter(Boolean)
        : config.scopes,
    expiresAt: expiresAt(token.expires_in),
    metadata: {
      email,
      avatar_url: typeof profile.picture === "string" ? profile.picture : null,
    },
  };
}

export async function exchangeOAuthCode(
  config: ProviderConfig,
  code: string,
  verifier: string,
) {
  const account =
    config.provider === "instagram"
      ? await exchangeInstagram(config, code)
      : config.provider === "x"
        ? await exchangeX(config, code, verifier)
        : await exchangeGoogle(config, code, verifier);

  return {
    ...account,
    tokenBundle: {
      ...account.tokenBundle,
      omnibox_client_id: config.clientId,
      omnibox_client_secret: config.clientSecret,
    },
  };
}
