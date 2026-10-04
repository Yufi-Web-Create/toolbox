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
  });
  it("does not include the analytics navigation or view", () => {
    expect(html).not.toContain('id="nav-analytics"');
    expect(html).not.toContain('id="view-analytics"');
    expect(html).not.toContain("switchView('analytics')");
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

  it("keeps alerts above the authentication portal", () => {
    expect(html).toContain('id="toast"');
    expect(html).toContain("z-[120]");
    expect(html).toContain('id="auth-portal-overlay"');
  });

  it("uses real provider OAuth routes instead of simulated SNS connections", () => {
    expect(html).toContain("/api/omnibox/oauth/");
    expect(html).toContain("/api/omnibox/connections");
    expect(html).toContain("loadProviderConnections");
    expect(html).toContain("providerOAuthReadiness");
    expect(html).not.toContain("このSNSの実OAuth連携は現在実装中です");
  });

  it("does not request Instagram, X, or Google passwords in the direct setup form", () => {
    expect(html).toContain("LINE手動設定");
    expect(html).toContain("LINE公式アカウント (Messaging API)");
    expect(html).not.toContain("Instagram (ユーザーID & パスワード連携)");
    expect(html).not.toContain("X (旧Twitter アカウント連携)</option>");
  });

  it("maps live inbox conversations across LINE Instagram and email", () => {
    expect(html).toContain("conversation.provider_connection_id");
    expect(html).toContain("provider === 'email' ? 'email' : provider");
    expect(html).toContain("matchedAccount?.id");
  });

  it("synchronizes connected Gmail inboxes through the real API route", () => {
    expect(html).toContain("/api/omnibox/google/sync");
    expect(html).toContain("syncGoogleInbox");
    expect(html).toContain("account.provider === 'google'");
  });

  it("sends replies from live LINE Instagram and email conversations", () => {
    expect(html).toContain("['line', 'instagram', 'email'].includes(thread.channel)");
    expect(html).toContain("/api/omnibox/reply");
    expect(html).toContain("getChannelMeta(thread.channel).name");
  });

  it("exposes Instagram webhook setup and Gmail sync controls", () => {
    expect(html).toContain("Instagram DM受信設定");
    expect(html).toContain("/api/omnibox/instagram/webhook-info");
    expect(html).toContain("showInstagramWebhookInfo");
    expect(html).toContain("Gmailを同期");
    expect(html).toContain("syncGoogleInbox");
  });

  it("supports X DM synchronization in the connected account UI", () => {
    expect(html).toContain("/api/omnibox/x/sync");
    expect(html).toContain("syncXInbox");
    expect(html).toContain("X DMを同期");
  });

  it("uses real social publishing and scheduled post APIs", () => {
    expect(html).toContain("/api/omnibox/posts");
    expect(html).toContain("new-post-media-url");
    expect(html).toContain("Instagram投稿には公開画像URL");
    expect(html).toContain("指定時刻に自動投稿します");
    expect(html).toContain("投稿未対応");
  });

  it("uses live inbox refresh without production pseudo receive controls", () => {
    expect(html).toContain("startLiveInboxRefresh");
    expect(html).toContain("1500");
    expect(html).toContain("自動更新");
    expect(html).not.toContain("疑似受信");
    expect(html).not.toContain("simulateIncomingMessage");
  });

  it("supports collapsible left status and right customer panels", () => {
    expect(html).toContain('id="status-sidebar"');
    expect(html).toContain("toggleStatusSidebar");
    expect(html).toContain('id="customer-info-panel"');
    expect(html).toContain("toggleCustomerPanel");
    expect(html).toContain("is-collapsed");
  });

  it("loads real managed staff for conversation assignment", () => {
    expect(html).toContain("loadAssignableStaff");
    expect(html).toContain("assignableStaff");
    expect(html).toContain("assigneeUserId");
    expect(html).not.toContain('<option value="山田 太郎">');
    expect(html).not.toContain('<option value="佐藤 美咲">');
  });

  it("preserves customer name edits during live inbox refresh", () => {
    expect(html).toContain("markCustomerNameEditing");
    expect(html).toContain("customerNameEditingThreadId");
    expect(html).toContain("document.activeElement !== customerNameInput");
  });

  it("renders received LINE stickers as typed messages", () => {
    expect(html).toContain("message.message_type || 'text'");
    expect(html).toContain("message.metadata || {}");
    expect(html).toContain("LINEスタンプ");
    expect(html).toContain('data-lucide="sticker"');
  });

  it("persists internal notes", () => {
    expect(html).toContain("/api/omnibox/notes");
    expect(html).toContain("社内共有メモを保存しました");
    expect(html).toContain("payload.notes");
  });

  it("keeps reply and internal-note drafts separated", () => {
    expect(html).toContain("composerDrafts");
    expect(html).toContain("composerDrafts[inputMode]?.set");
    expect(html).toContain("社内共有メモを入力");
  });

  it("does not generate fake AI replies before AI is connected", () => {
    expect(html).toContain("AI機能は現在準備中です");
    expect(html).toContain("AI丁寧返信（準備中）");
    expect(html).not.toContain("確認が取れましたのでご案内いたします");
    expect(html).not.toContain("しっかり確認できました");
  });

  it("supports tablet and mobile inbox layouts", () => {
    expect(html).toContain("@media (max-width: 1199px)");
    expect(html).toContain("@media (max-width: 767px)");
    expect(html).toContain('id="thread-list-pane"');
    expect(html).toContain("mobile-chat-open");
    expect(html).toContain("closeMobileChat");
    expect(html).toContain("applyResponsiveDefaults");
  });

  it("uses full inbox search and clearer operational labels", () => {
    expect(html).toContain("/api/omnibox/search?q=");
    expect(html).toContain("未読 ");
    expect(html).toContain("受信会話数");
    expect(html).toContain("OmniBox運営側のOAuth設定未完了");
  });

  it("supports editing reply templates and a general filter", () => {
    expect(html).toContain("editReplyTemplate");
    expect(html).toContain("templateEditingId");
    expect(html).toContain('data-cat="general"');
    expect(html).toContain("カーソル位置に挿入しました");
  });

  it("contains syntactically valid connected module JavaScript", () => {
    const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match?.[1] ?? "")).not.toThrow();
  });
});
