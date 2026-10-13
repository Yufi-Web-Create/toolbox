import { describe, expect, it, vi } from "vitest";
import { XChatBrowserSession, signingKeysFor, type XChatXdk } from "./browser-session";

function stubChat(): XChatXdk {
  return {
    unlock: vi.fn(async () => undefined),
    setRejectUnverified: vi.fn(),
    setIdentity: vi.fn(),
    setSigningKeys: vi.fn(),
    setCacheKeys: vi.fn(),
    decryptEvents: vi.fn(() => ({ messages: [
      { event: { type: "message", messageId: "a", conversationId: "1-2", senderId: "2",
        content: { contentType: "text", text: "hello" } } },
      { event: { type: "message", messageId: "b", conversationId: "1-2", senderId: "2",
        content: { contentType: "text", text: "unverified" }, verified: false } },
    ], errors: [{ code: "bad_signature" }] })),
    encryptMessage: vi.fn(() => ({
      messageId: "00000000-0000-4000-8000-000000000000",
      encryptedContent: "encrypted_event_payload_12345678",
      encodedEventSignature: "encoded_signature_value_12345678",
    })),
  };
}

describe("X Chat browser-only cryptographic coordinator", () => {
  it("rejects reads before user unlocks a known identity", () => {
    const session = new XChatBrowserSession(stubChat());
    expect(() => session.decryptVerifiedEvents(["anything"])).toThrow("locked");
    expect(() => session.prepareEncryptedReply("1-2", "hello")).toThrow("locked");
  });
  it("forwards unlock to SDK, renders verified text once, and omits failed signatures", async () => {
    const chat = stubChat();
    const session = new XChatBrowserSession(chat);
    await session.unlockExistingKeys("example-pin-only-for-unit-test", "123", "1");
    expect(chat.unlock).toHaveBeenCalledWith("example-pin-only-for-unit-test");
    expect(chat.setRejectUnverified).toHaveBeenCalledWith(true);
    expect(chat.setIdentity).toHaveBeenCalledWith("123", "1");
    expect(session.decryptVerifiedEvents(["ciphertext"])).toEqual([
      { messageId: "a", conversationId: "1-2", senderId: "2", text: "hello" }
    ]);
    expect(session.decryptVerifiedEvents(["ciphertext"])).toEqual([]);
  });
  it("encrypts replies locally; transport receives only SDK ciphertext", async () => {
    const chat = stubChat();
    chat.lock = vi.fn();
    const session = new XChatBrowserSession(chat);
    await session.unlockExistingKeys("local-only-test-passcode", "123", "1");
    expect(session.prepareEncryptedReply("1-2", "Hello there")).toEqual({
      message_id: "00000000-0000-4000-8000-000000000000",
      encoded_message_create_event: "encrypted_event_payload_12345678",
      encoded_message_event_signature: "encoded_signature_value_12345678",
    });
    expect(chat.encryptMessage).toHaveBeenCalledWith({
      conversationId: "1-2", text: "Hello there",
    });
    session.lock();
    expect(chat.lock).toHaveBeenCalledOnce();
    expect(() => session.prepareEncryptedReply("1-2", "again")).toThrow("locked");
  });
  it("maps public signing keys according to official Chat XDK types", () => {
    expect(signingKeysFor("123", [{
      public_key_version: 1, public_key: "identity", signing_public_key: "signing",
      identity_public_key_signature: "binding",
    }])).toEqual([{
      userId: "123", publicKeyVersion: "1", publicKey: "signing",
      identityPublicKey: "identity", identityPublicKeySignature: "binding",
    }]);
  });
});
