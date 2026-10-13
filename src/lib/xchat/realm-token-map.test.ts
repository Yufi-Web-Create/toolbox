import { describe, expect, it } from "vitest";
import { buildExistingKeyUnlockConfig, makeRealmTokenProvider } from "./realm-token-map";

describe("X Chat realm token provider", () => {
  it("extracts the official array-shaped token_map without exposing tokens in the config status", async () => {
    const config = {
      key_store_token_map_json: '{"realms":[]}',
      token_map: [
        { key: "realm-1", value: { address: "https://realm.invalid", token: "secret-1" } },
        { key: "realm-2", value: { address: "https://realm.invalid", token: "secret-2" } },
      ],
    };
    const provider = makeRealmTokenProvider(config);
    expect(await provider("realm-1")).toBe("secret-1");
    expect(await provider("realm-2")).toBe("secret-2");
    await expect(provider("unknown")).rejects.toThrow("unavailable");
  });

  it("rejects incomplete credentials instead of guessing another realm", async () => {
    const provider = makeRealmTokenProvider({
      token_map: [{ key: "realm-1", value: { address: "https://realm.invalid" } }],
    });
    await expect(provider("realm-1")).rejects.toThrow("unavailable");
  });

  it("builds a Chat XDK unlock configuration from an existing key only", async () => {
    const xdkConfig = buildExistingKeyUnlockConfig({
      public_key_version: "12",
      juicebox_config: { token_map: [{ key: "realm-1", value: { token: "secret" } }] },
    });
    expect(xdkConfig.signingKeyVersion).toBe("12");
    expect(await xdkConfig.getAuthToken("realm-1")).toBe("secret");
    expect(() => buildExistingKeyUnlockConfig({ public_key_version: "12" })).toThrow("not configured");
  });
});
