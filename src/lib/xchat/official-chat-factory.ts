"use client";

import type { CreateChatXdk } from "./browser-unlock";

/**
 * Load the pinned, official X Chat WASM SDK only on the client.
 * The PIN never crosses the MatoMeet API boundary.
 */
export const createOfficialChatXdk: CreateChatXdk = async (options) => {
  if (typeof window === "undefined") {
    throw new Error("X Chat private-key recovery is available only in the browser");
  }
  const { createChat } = await import("@xdevplatform/chat-xdk");
  const chat = await createChat({
    juiceboxConfig: options.juiceboxConfig,
    getAuthToken: options.getAuthToken,
  });
  // Official XDK uses the same runtime methods as the session coordinator.
  // Keep this single adapter boundary for SDK version upgrades.
  return chat;
};
