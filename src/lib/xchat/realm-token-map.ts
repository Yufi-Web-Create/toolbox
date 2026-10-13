/**
 * Maps only the official X Chat public-key record's Juicebox realm tokens.
 * This runs in a trusted browser session. Never log, persist, send, or expose
 * the resulting tokens to analytics, server diagnostics, or error messages.
 */
export type JuiceboxConfig = {
  key_store_token_map_json?: string;
  token_map?: Array<{ key?: string; value?: { address?: string; token?: string } }> |
    Record<string, { token?: string; address?: string } | string>;
  sdk_config?: unknown;
};

export function makeRealmTokenProvider(config: JuiceboxConfig) {
  const tokens = new Map<string, string>();
  const map = config.token_map;
  if (Array.isArray(map)) {
    for (const entry of map) {
      const realmId = entry?.key;
      const token = entry?.value?.token;
      if (typeof realmId === "string" && realmId.length > 0 &&
          typeof token === "string" && token.length > 0) {
        tokens.set(realmId, token);
      }
    }
  } else if (map && typeof map === "object") {
    for (const [realmId, item] of Object.entries(map)) {
      const token = typeof item === "string" ? item : item?.token;
      if (realmId && typeof token === "string" && token.length > 0) {
        tokens.set(realmId, token);
      }
    }
  }
  // Never fall back to OAuth, a network token minting guess, or a mismatched realm.
  return async (realmId: string): Promise<string> => {
    const token = tokens.get(realmId);
    if (!token) throw new Error("X Chat backup authorization is unavailable for this realm");
    return token;
  };
}

export type XChatKeyRecord = {
  public_key_version: string | number;
  juicebox_config?: JuiceboxConfig;
};

export function buildExistingKeyUnlockConfig(record: XChatKeyRecord) {
  if (!record?.juicebox_config || !record.public_key_version) {
    throw new Error("X Chat existing key backup is not configured");
  }
  const config = record.juicebox_config;
  const getAuthToken = makeRealmTokenProvider(config);
  return {
    juiceboxConfig: JSON.stringify(config),
    getAuthToken,
    signingKeyVersion: String(record.public_key_version),
  };
}
