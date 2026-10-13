import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("shows the API guidance through the actual manual sync button handler", async () => {
  const html = readFileSync("public/omnibox.html", "utf8");
  const start = html.indexOf("    async function syncXInbox(");
  const handlerStart = html.indexOf("    window.manualSyncXInbox", start);
  const end = html.indexOf("\n    };", handlerStart) + "\n    };".length;
  const toast = vi.fn();
  const context = {
    window: {} as { manualSyncXInbox: (button: { disabled: boolean; innerHTML: string }) => Promise<void> },
    isDemoSession: false, connectedAccounts: [{ provider: "x" }],
    fetch: async () => Response.json({ ok: false, message: "X APIのクレジットが不足しています。" }, { status: 502 }),
    showToast: toast, lucide: { createIcons: vi.fn() }, loadLiveInbox: vi.fn(),
  };
  runInNewContext(html.slice(start, end), context);
  const button = { disabled: false, innerHTML: "X DMを同期" };
  await context.window.manualSyncXInbox(button);
  expect(toast).toHaveBeenCalledWith("X APIのクレジットが不足しています。", "error");
  expect(button).toEqual({ disabled: false, innerHTML: "X DMを同期" });
});
