import { describe, expect, it, vi } from "vitest";
import { unlockExistingXChatSession } from "./browser-unlock";
import type { XChatXdk } from "./browser-session";

function sdk() {
  return {
    unlock: vi.fn(async (_pin: string) => undefined),
    setIdentity: vi.fn(),
    setSigningKeys: vi.fn(),
    setCacheKeys: vi.fn(),
    setRejectUnverified: vi.fn(),
    lock: vi.fn(),
    decryptEvents: vi.fn(() => ({ messages: [] })),
    encryptMessage: vi.fn(() => ({
      messageId: "id",
      encryptedContent: "cipher",
      encodedEventSignature: "sig",
    })),
  } satisfies XChatXdk;
}

describe("X Chat existing identity browser recovery", () => {
  const bootstrap = {
    account_id: "12345",
    data: [{
      public_key_version: "v1",
      juicebox_config: {
        key_store_token_map_json: "{\"realms\":[]}",
        token_map: [{ key: "realm-a", value: { token: "token-a" } }],
      },
    }],
  };

  it("passes per-realm X-issued tokens only to Chat XDK and unlocks in browser", async () => {
    const chat = sdk();
    const factory = vi.fn(async ({ getAuthToken }: {
      juiceboxConfig: string; getAuthToken: (realmId: string) => Promise<string>
    }) => {
      expect(await getAuthToken("realm-a")).toBe("token-a");
      await expect(getAuthToken("other")).rejects.toThrow("unavailable");
      return chat;
    });
    const session = await unlockExistingXChatSession({
      bootstrap, pin: "unit-test-pin", createChat: factory,
    });
    expect(factory).toHaveBeenCalledOnce();
    expect(chat.unlock).toHaveBeenCalledWith("unit-test-pin");
    expect(chat.setIdentity).toHaveBeenCalledWith("12345", "v1");
    session.lock();
    expect(chat.lock).toHaveBeenCalled();
  });

  it("locks SDK and redacts private errors on failed PIN recovery", async () => {
    const chat = sdk();
    chat.unlock.mockRejectedValueOnce(new Error("private response secret"));
    await expect(unlockExistingXChatSession({
      bootstrap, pin: "incorrect-pin", createChat: async () => chat,
    })).rejects.toThrow("X Chat key recovery failed");
    expect(chat.lock).toHaveBeenCalled();
  });
});
