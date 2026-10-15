import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("X remains publishing-only", () => {
  it.each(["sync", "chat_read", "chat_send", "chat_import", "chat_status", "chat_key_status"])(
    "disables %s without accessing any upstream provider",
    async (mode) => {
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);
      try {
        const result = await POST();
        expect(result.status).toBe(410);
        expect(await result.json()).toEqual({
          ok: false,
          message: "Xは投稿専用です。DMの送受信は利用できません。",
        });
        expect(upstream).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});
