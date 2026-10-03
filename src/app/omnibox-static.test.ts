import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("uploaded OmniBox application shell", () => {
  const html = readFileSync(join(process.cwd(), "public", "omnibox.html"), "utf8");

  it("keeps the supplied OmniBox login and staff registration portal", () => {
    expect(html).toContain("OmniBox ポータル");
    expect(html).toContain("ログイン");
    expect(html).toContain("スタッフ新規登録");
    expect(html).toContain("auth-input-name");
  });

  it("uses real app APIs instead of Firebase authentication", () => {
    expect(html).toContain("/api/omnibox/login");
    expect(html).toContain("/api/omnibox/signup");
    expect(html).toContain("/api/omnibox/inbox");
    expect(html).toContain("/api/omnibox/reply");
    expect(html).not.toContain("firebase-app.js");
    expect(html).not.toContain("signInAnonymously");
  });

  it("keeps the supplied main OmniBox views", () => {
    expect(html).toContain('id="view-inbox"');
    expect(html).toContain('id="view-publish"');
    expect(html).toContain('id="view-templates"');
    expect(html).toContain('id="view-channels"');
    expect(html).toContain('id="view-analytics"');
  });

  it("requires Cmd+Enter on Mac or Ctrl+Enter on Windows to send", () => {
    expect(html).toContain("Enterで改行 / ⌘+Enter・Ctrl+Enterで送信");
    expect(html).toContain("(e.metaKey || e.ctrlKey)");
    expect(html).toContain("!e.isComposing");
    expect(html).not.toContain("e.key === 'Enter' && !e.shiftKey");
  });

  it("contains syntactically valid connected module JavaScript", () => {
    const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match?.[1] ?? "")).not.toThrow();
  });
});
