import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("uploaded OmniBox application shell", () => {
  const html = readFileSync(join(process.cwd(), "public", "omnibox.html"), "utf8");

  it("keeps the supplied OmniBox login and staff registration portal", () => {
    expect(html).toContain("OmniBox ポータル");
    expect(html).toContain("ログイン");
    expect(html).toContain("管理者アカウント作成");
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

  it("keeps login hidden until the real session check finishes", () => {
    expect(html).toContain('id="session-loading-overlay"');
    expect(html).toContain('id="auth-portal-overlay" class="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 hidden');
    expect(html).toContain("session-loading-overlay')?.classList.add('hidden')");
    expect(html).toContain("portal.classList.add('flex')");
  });

  it("provides administrator onboarding and role-aware settings", () => {
    expect(html).toContain('id="view-settings"');
    expect(html).toContain('id="menu-organization-settings"');
    expect(html).toContain('id="settings-initial-organization-banner"');
    expect(html).toContain("組織ID（従業員ログイン用）");
    expect(html).toContain("loggedInUser.roleKey !== 'owner'");
    expect(html).toContain("/api/omnibox/settings/account");
    expect(html).toContain("/api/omnibox/settings/organization");
    expect(html).toContain("/api/omnibox/settings/employees");
    expect(html).toContain("組織設定は管理者のみ変更できます");
    expect(html).toContain("ログアウト");
  });

  it("supports employee login with organization ID", () => {
    expect(html).toContain('id="auth-input-organization"');
    expect(html).toContain("switchLoginType('employee')");
    expect(html).toContain("organizationId");
    expect(html).toContain("従業員としてログイン");
  });

  it("keeps the full account area clickable", () => {
    expect(html).toContain('id="user-menu-trigger"');
    expect(html).toContain("e.target.closest('#user-menu-trigger')");
  });

  it("provides real quick demo sessions for administrator and staff", () => {
    expect(html).toContain("クイック体験・デモログイン");
    expect(html).toContain("quickLoginDemo('admin')");
    expect(html).toContain("quickLoginDemo('staff')");
    expect(html).toContain("/api/omnibox/demo-login");
  });

  it("supports persistent template creation and deletion", () => {
    expect(html).toContain("定型文を登録");
    expect(html).toContain("/api/omnibox/templates");
    expect(html).toContain("createReplyTemplate");
    expect(html).toContain("deleteReplyTemplate");
  });

  it("supports customer rename, avatars, and icon-only platform badges", () => {
    expect(html).toContain("saveCustomerName");
    expect(html).toContain("/api/omnibox/customer");
    expect(html).toContain("/api/omnibox/customer/profile");
    expect(html).toContain("customerAvatarUrl");
    expect(html).toContain('data-lucide="message-circle"');
    expect(html).not.toContain("meta.text");
  });

  it("loads conversation detail without rebuilding the entire inbox list on click", () => {
    expect(html).toContain("loadConversationDetail");
    expect(html).toContain("Conversation detail load failed");
    const start = html.indexOf("window.selectThread = async function(id)");
    const end = html.indexOf("function updateActiveChatPane(thread)", start);
    const selectThreadSource = html.slice(start, end);
    expect(selectThreadSource).not.toContain("loadLiveInbox");
    expect(selectThreadSource).toContain("loadConversationDetail");
  });

  it("provides employee rename, password reset, and deletion controls", () => {
    expect(html).toContain("renameEmployee");
    expect(html).toContain("resetEmployeePassword");
    expect(html).toContain("deleteEmployeeAccount");
    expect(html).toContain("ログイン用組織ID");
  });

  it("contains syntactically valid connected module JavaScript", () => {
    const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match?.[1] ?? "")).not.toThrow();
  });
});
