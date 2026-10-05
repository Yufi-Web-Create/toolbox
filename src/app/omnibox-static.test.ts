import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("uploaded MatoMeet application shell", () => {
  const html = readFileSync(join(process.cwd(), "public", "omnibox.html"), "utf8");

  it("keeps the supplied MatoMeet login and staff registration portal", () => {
    expect(html).toContain("MatoMeet ポータル");
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

  it("keeps the supplied main MatoMeet views", () => {
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
    expect(html).toContain("初期設定後の組織IDは変更できません");
    expect(html).toContain("loggedInUser.roleKey !== 'owner'");
    expect(html).toContain("/api/omnibox/settings/account");
    expect(html).toContain("/api/omnibox/settings/organization");
    expect(html).toContain("/api/omnibox/settings/employees");
    expect(html).toContain("組織設定は管理者のみ変更できます");
    expect(html).toContain("ログアウト");
  });

  it("supports ID-and-password login for administrators and employees", () => {
    expect(html).toContain('id="auth-input-login-id"');
    expect(html).toContain("switchLoginType('employee')");
    expect(html).toContain("従業員としてログイン");
    expect(html).toContain("IDとパスワードを入力してください");
    expect(html).toContain('id="employee-create-login-id"');
    expect(html).not.toContain('id="auth-input-email"');
    expect(html).not.toContain('id="employee-create-email"');
  });

  it("keeps the full account area clickable and closes the menu safely", () => {
    expect(html).toContain('id="user-menu-trigger"');
    expect(html).toContain("pointerdown");
    expect(html).toContain("target.closest?.('#user-menu-trigger')");
    expect(html).toContain("e.key === 'Escape'");
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

  it("shows a blocking loading modal while creating an employee", () => {
    expect(html).toContain('id="employee-create-loading-modal"');
    expect(html).toContain("従業員アカウントを登録中");
    expect(html).toContain("loadingModal?.classList.remove('hidden')");
    expect(html).toContain("loadingModal?.classList.add('hidden')");
  });

  it("provides employee rename, password reset, and deletion controls", () => {
    expect(html).toContain("renameEmployee");
    expect(html).toContain("resetEmployeePassword");
    expect(html).toContain("deleteEmployeeAccount");
    expect(html).toContain("管理者含む");
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

  it("sends replies from live LINE Instagram X and email conversations", () => {
    expect(html).toContain("['line', 'instagram', 'email', 'x'].includes(thread.channel)");
    expect(html).toContain("/api/omnibox/reply");
    expect(html).toContain("getChannelMeta(thread.channel).name");
  });

  it("exposes Instagram webhook subscription controls and Gmail sync controls", () => {
    expect(html).toContain("Instagram DM受信状態");
    expect(html).toContain("/api/omnibox/instagram/subscription");
    expect(html).toContain("showInstagramWebhookInfo");
    expect(html).toContain("Gmailを同期");
    expect(html).toContain("syncGoogleInbox");
  });

  it("supports X DM synchronization in the connected account UI", () => {
    expect(html).toContain("/api/omnibox/x/sync");
    expect(html).toContain("syncXInbox");
    expect(html).toContain("X DMを同期");
  });

  it("uses direct multi-image social publishing and scheduled post APIs", () => {
    expect(html).toContain("/api/omnibox/posts");
    expect(html).toContain("/api/omnibox/media");
    expect(html).toContain('id="new-post-media-files"');
    expect(html).toContain("Instagramは最大10枚");
    expect(html).toContain("Xを含む投稿は最大4枚");
    expect(html).toContain("movePostImage");
    expect(html).not.toContain("new-post-media-url");
  });

  it("provides a publish calendar, AI composer, and completion modal", () => {
    expect(html).toContain('id="publish-calendar-grid"');
    expect(html).toContain("openNewPostModalForDate");
    expect(html).toContain("changePublishCalendarMonth");
    expect(html).toContain('id="new-post-ai-brief"');
    expect(html).toContain("/api/omnibox/ai/post");
    expect(html).toContain('id="post-success-modal"');
    expect(html).toContain("showPostSuccess");
    expect(html).toContain("window.location.reload()");
    expect(html).not.toContain("bg-gradient-to-br from-teal-500 to-emerald-600 text-white p-5 rounded-2xl shadow-sm");
  });

  it("persists the active view and keeps mobile inbox hidden on other views", () => {
    expect(html).toContain("omnibox_active_view");
    expect(html).toContain("restoreActiveView");
    expect(html).toContain("#view-inbox:not(.hidden)");
    expect(html).toContain(".view-panel.hidden");
    expect(html).not.toContain('id="scheduled-nav-badge"');
  });

  it("rehydrates settings after session restore and remembers the settings tab", () => {
    expect(html).toContain("omnibox_settings_tab");
    expect(html).toContain("window.openSettings(settingsTab)");
    expect(html).toContain("localStorage.setItem('omnibox_settings_tab', target)");
  });

  it("uses clean favicon markup without rendering escaped newlines", () => {
    expect(html).toContain('href="/favicon.ico"');
    expect(html).not.toContain('sizes="any">\\\\n');
  });

  it("supports temporary AI quota, Japan holidays, and send safety checks", () => {
    expect(html).toContain("AI_TRIAL_QUOTA_MAX");
    expect(html).toContain("ai-reply-quota-label");
    expect(html).toContain("ai-post-quota-label");
    expect(html).toContain("buildJapanHolidays");
    expect(html).toContain("振替休日");
    expect(html).toContain("国民の休日");
    expect(html).toContain("未入力の差し込み項目");
    expect(html).toContain("post.statusKey === 'cancelled'");
  });

  it("uses event-driven inbox refresh without production pseudo receive controls", () => {
    expect(html).toContain("startLiveInboxRefresh");
    expect(html).toContain("/api/omnibox/inbox/events");
    expect(html).toContain("window.EventSource");
    expect(html).toContain("リアルタイム受信");
    expect(html).not.toContain("setInterval(refresh, 1500)");
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

  it("keeps reply and internal-note drafts separated and preserves typing", () => {
    expect(html).toContain("composerDrafts");
    expect(html).toContain("composerDrafts[inputMode]?.set");
    expect(html).toContain("saveComposerDraft()");
    expect(html).toContain("社内共有メモを入力");
  });

  it("guards inbox search from credential autofill and explains Instagram requests", () => {
    expect(html).toContain('name="omnibox_inbox_search"');
    expect(html).toContain('autocomplete="off"');
    expect(html).toContain("readonly onpointerdown=\"activateInboxSearch(this)\"");
    expect(html).toContain('id="auth-input-login-id" name="omnibox_login_id" autocomplete="username"');
    expect(html).toContain("looksLikeCredentialAutofill");
    expect(html).toContain("Instagram 初回メッセージ");
    expect(html).toContain("初回返信を送るとInstagram側で承認され");
  });

  it("does not expose fake AI generation before AI is connected", () => {
    expect(html).not.toContain("AI丁寧返信（準備中）");
    expect(html).not.toContain("親しみやすい返信（準備中）");
    expect(html).not.toContain("確認が取れましたのでご案内いたします");
    expect(html).not.toContain("しっかり確認できました");
    expect(html).not.toContain("generateFallbackDraft");
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
    expect(html).toContain("MatoMeet運営側のOAuth設定が未完了");
  });

  it("supports editing reply templates and a general filter", () => {
    expect(html).toContain("editReplyTemplate");
    expect(html).toContain("templateEditingId");
    expect(html).toContain('data-cat="general"');
    expect(html).toContain("カーソル位置に挿入しました");
  });

  it("supports plan selection and plan-based feature locking", () => {
    expect(html).toContain("ご契約プラン");
    expect(html).toContain("/api/omnibox/settings/plan");
    expect(html).toContain("changeOrganizationPlan");
    expect(html).toContain("applyPlanAccess");
    expect(html).toContain("currentPlanFeatures");
  });

  it("keeps inbox and settings safe while session data is loading", () => {
    expect(html).toContain("inboxLoading");
    expect(html).toContain("問い合わせを読み込んでいます");
    expect(html).toContain('id="badge-count-all" class="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700">—</span>');
    expect(html).toContain('id="nav-account-count">—</span>');
    expect(html).toContain('id="unread-total-badge" class="ml-1 text-[11px] px-1.5 py-0.2 bg-brand-600 text-white rounded-full font-bold">確認中</span>');
    expect(html).toContain("sessionReady");
    expect(html).toContain("ログイン情報の確認が完了していないため保存できません");
    expect(html).toContain('name="nickname"');
    expect(html).toContain('autocomplete="nickname"');
    expect(html).toContain('name="username"');
    expect(html).toContain('autocomplete="username"');
  });

  it("uses accessible MatoMeet rose and warm neutral styling", () => {
    expect(html).toContain("600: '#B94A61'");
    expect(html).toContain("700: '#A84459'");
    expect(html).not.toContain("border-violet-400 bg-violet-50");
    expect(html).toContain("MatoMeet warm neutrals");
    expect(html).toContain('id="chat-recipient-account-badge" class="font-medium text-slate-700 bg-slate-100');
  });

  it("shows actual connection state and plan-aware AI quota", () => {
    expect(html).toContain("connected ? '接続済み'");
    expect(html).toContain("getAiMonthlyLimit");
    expect(html).toContain("aiResponsesPerMonth");
    expect(html).toContain("matomeet_ai_usage_");
    expect(html).not.toContain("localStorage.getItem('omnibox_ai_trial_quota')");
    expect(html).toContain("SNS窓口のログイン連携");
    expect(html).not.toContain("SNS・メール窓口のログイン連携");
  });

  it("supports renaming connected account display names", () => {
    expect(html).toContain("renameConnectedAccount");
    expect(html).toContain("連携アカウント名を変更しました");
    expect(html).toContain("providerConnectionId");
  });

  it("removes redundant cloud-sync and product tagline labels", () => {
    expect(html).not.toContain("Cloud Sync 有効");
    expect(html).not.toContain("複数SNS一元管理 & 予約投稿ハブ");
  });

  it("keeps provider connection guidance customer-facing", () => {
    expect(html).not.toContain("OAuth Developer App 設定");
    expect(html).not.toContain("LINE公式アカウントの実接続");
    expect(html).toContain("/api/omnibox/oauth/");
  });

  it("contains syntactically valid connected module JavaScript", () => {
    const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match?.[1] ?? "")).not.toThrow();
  });
});
