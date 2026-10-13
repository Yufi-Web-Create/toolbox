import { XChatBrowserSession, type XChatXdk } from "./browser-session";
import { buildExistingKeyUnlockConfig, type XChatKeyRecord } from "./realm-token-map";

export type CreateChatXdk = (options: {
  juiceboxConfig: string;
  getAuthToken: (realmId: string) => Promise<string>;
}) => Promise<XChatXdk>;

type BootstrapResponse = {
  account_id?: string;
  data?: XChatKeyRecord[];
};

/**
 * Local-only PIN unlock for an existing X Chat account.
 *
 * The host UI calls this only in a trusted browser user gesture, with a Chat
 * XDK factory sourced from the pinned, audited official SDK package.
 * No server endpoint in this flow accepts a PIN. Never call setup(),
 * generateKeypairs(), or register public keys for an existing X identity.
 */
export async function unlockExistingXChatSession({
  bootstrap,
  pin,
  createChat,
}: {
  bootstrap: BootstrapResponse;
  pin: string;
  createChat: CreateChatXdk;
}): Promise<XChatBrowserSession> {
  const accountId = bootstrap.account_id;
  if (!accountId || !/^[0-9]{1,24}$/.test(accountId)) {
    throw new Error("X Chat account identity unavailable");
  }
  const records = bootstrap.data;
  if (!Array.isArray(records) || records.length !== 1) {
    throw new Error("X Chat key version is ambiguous");
  }
  const options = buildExistingKeyUnlockConfig(records[0]);
  // The official SDK gets tokens for individual backup realms from the
  // returned X API config in memory. Do not send them to MatoMeet servers.
  const chat = await createChat({
    juiceboxConfig: options.juiceboxConfig,
    getAuthToken: options.getAuthToken,
  });
  const session = new XChatBrowserSession(chat);
  try {
    await session.unlockExistingKeys(pin, accountId, options.signingKeyVersion);
    return session;
  } catch {
    session.lock();
    // Never propagate underlying PIN, tokens or backup response details.
    throw new Error("X Chat key recovery failed. Check PIN and backup authorization.");
  }
}
