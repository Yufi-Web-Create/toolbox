/**
 * X Chat crypto session coordinator.
 *
 * Browser only. Does not persist passcodes, opaque key blobs, decrypted text, or keys.
 * The official @xdevplatform/chat-xdk instance is injected by the UI; this file
 * intentionally cannot create or rotate identity keys.
 *
 * The PIN recovery token provider must be a legitimate X/realm authorization
 * integration; OAuth dm.read is not interchangeable with realm authorization.
 */
export type XChatSigningKey = {
  userId: string;
  publicKeyVersion: string;
  publicKey: string;
  identityPublicKey: string;
  identityPublicKeySignature: string;
};

export type XChatVerifiedMessage = {
  messageId: string;
  conversationId: string;
  senderId: string;
  text: string;
};

export type XChatXdk = {
  unlock(passcode: string): Promise<unknown>;
  setIdentity(userId: string, keyVersion: string): void;
  setSigningKeys(keys: XChatSigningKey[]): void;
  setCacheKeys(enabled: boolean): void;
  decryptEvents(events: string[]): {
    messages: Array<{
      event: {
        type: string;
        messageId?: string;
        conversationId?: string;
        senderId?: string;
        content?: { contentType?: string; text?: string };
        verified?: boolean;
      };
      verified?: boolean;
    }>;
    errors?: unknown[];
  };
  encryptMessage(params: { conversationId: string; text: string }): {
    messageId: string;
    encryptedContent: string;
    encodedEventSignature: string;
  };
};

type KeyRecord = {
  public_key_version: string | number;
  public_key: string;
  signing_public_key: string;
  identity_public_key_signature: string;
};

export function signingKeysFor(userId: string, records: KeyRecord[]): XChatSigningKey[] {
  if (!/^[0-9]{1,24}$/.test(userId)) throw new Error("Invalid X user ID");
  return records.map((r) => ({
    userId,
    publicKeyVersion: String(r.public_key_version),
    publicKey: r.signing_public_key,
    identityPublicKey: r.public_key,
    identityPublicKeySignature: r.identity_public_key_signature,
  }));
}

export class XChatBrowserSession {
  private unlocked = false;
  private seen = new Set<string>();

  constructor(private readonly chat: XChatXdk) {}

  async unlockExistingKeys(passcode: string, userId: string, keyVersion: string) {
    if (!/^[0-9]{1,24}$/.test(userId) || !/^\\d+$/.test(keyVersion)) throw new Error("Invalid X identity");
    if (!passcode) throw new Error("Passcode required");
    // Never store or log the PIN. Caller must discard it immediately afterward.
    await this.chat.unlock(passcode);
    this.chat.setIdentity(userId, keyVersion);
    this.chat.setCacheKeys(true);
    this.unlocked = true;
  }

  configureParticipantKeys(keys: XChatSigningKey[]) {
    if (!this.unlocked) throw new Error("X Chat keys locked");
    this.chat.setSigningKeys(keys);
  }

  decryptVerifiedEvents(encodedEvents: string[]): XChatVerifiedMessage[] {
    if (!this.unlocked) throw new Error("X Chat keys locked");
    const result = this.chat.decryptEvents(encodedEvents);
    // Per-event errors are not ignored: a mixed batch may include valid messages,
    // but never import or render an event unless its signature is verified.
    const output: XChatVerifiedMessage[] = [];
    for (const { event, verified } of result.messages) {
      if (verified !== true || event.verified === false) continue;
      if (event.type !== "message" || event.content?.contentType !== "text") continue;
      if (!event.messageId || !event.conversationId || !event.senderId ||
          typeof event.content.text !== "string") continue;
      const dedupeKey = event.conversationId + ":" + event.messageId;
      if (this.seen.has(dedupeKey)) continue;
      this.seen.add(dedupeKey);
      output.push({
        messageId: event.messageId,
        conversationId: event.conversationId,
        senderId: event.senderId,
        text: event.content.text,
      });
    }
    return output;
  }

  prepareEncryptedReply(conversationId: string, text: string) {
    if (!this.unlocked) throw new Error("X Chat keys locked");
    if (!text.trim()) throw new Error("Empty reply");
    if (!/^(?:[0-9]+(?:[:-][0-9]+)?|g[A-Za-z0-9_-]+)$/.test(conversationId)) {
      throw new Error("Invalid conversation ID");
    }
    const encrypted = this.chat.encryptMessage({ conversationId, text });
    if (!encrypted.messageId || !encrypted.encryptedContent || !encrypted.encodedEventSignature) {
      throw new Error("X Chat encryption failed");
    }
    return {
      message_id: encrypted.messageId,
      encoded_message_create_event: encrypted.encryptedContent,
      encoded_message_event_signature: encrypted.encodedEventSignature,
    };
  }

  lock() {
    this.unlocked = false;
    this.seen.clear();
    // The owning UI MUST also dispose of its Chat XDK instance (keys live there).
  }
}
