import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("offers Gmail sync while removing legacy X DM and Chat actions from the app UI", () => {
  const html = readFileSync("public/omnibox.html", "utf8");
  expect(html).toContain("syncGoogleInbox");
  expect(html).toContain("Gmailを同期");
  expect(html).toContain("startOAuthFlow('google')");
  expect(html).not.toContain("manualSyncXInbox");
  expect(html).not.toContain("checkXChatStatus");
  expect(html).not.toContain("checkXChatKeyStatus");
  expect(html).not.toContain("/api/omnibox/x/sync");
});
