import Link from "next/link";
import { redirect } from "next/navigation";

import { getAiRuntimeConfig } from "../../lib/ai-config";
import { getProviderConfig } from "../../lib/integrations/oauth/providers";
import {
  hasMasterSession,
  isMasterConfigured,
} from "../../lib/master-auth";
import {
  configureAiFromMaster,
  configureLineFromMaster,
  configureOAuthProviderFromMaster,
  masterLogout,
  repairLineFromMaster,
} from "./actions";
import styles from "./page.module.css";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

const APP_ORIGIN =
  process.env.APP_URL?.trim() || "https://toolbox-pink-nine.vercel.app";

type LineHealth = {
  available: boolean;
  configured: boolean;
  lineConnected: boolean;
  lineApiReachable: boolean | null;
  webhookActive: boolean | null;
  webhookMatches: boolean | null;
  webhookUrl: string | null;
};

async function getLineHealth(): Promise<LineHealth> {
  try {
    const response = await fetch(new URL("/health", BRIDGE_URL), {
      cache: "no-store",
    });
    const data = response.ok
      ? ((await response.json()) as Record<string, unknown>)
      : {};

    return {
      available: response.ok,
      configured: data.configured === true,
      lineConnected: data.lineConnected === true,
      lineApiReachable:
        typeof data.lineApiReachable === "boolean"
          ? data.lineApiReachable
          : null,
      webhookActive:
        typeof data.webhookActive === "boolean"
          ? data.webhookActive
          : null,
      webhookMatches:
        typeof data.webhookMatches === "boolean"
          ? data.webhookMatches
          : null,
      webhookUrl:
        typeof data.webhookUrl === "string" ? data.webhookUrl : null,
    };
  } catch {
    return {
      available: false,
      configured: false,
      lineConnected: false,
      lineApiReachable: null,
      webhookActive: null,
      webhookMatches: null,
      webhookUrl: null,
    };
  }
}

function State({
  ready,
  readyText = "設定済み",
  pendingText = "要設定",
}: {
  ready: boolean;
  readyText?: string;
  pendingText?: string;
}) {
  return (
    <span className={ready ? styles.ready : styles.warning}>
      {ready ? readyText : pendingText}
    </span>
  );
}

function ProviderForm({
  provider,
  title,
  clientId,
  scopes,
  callbackUrl,
  configured,
}: {
  provider: "instagram" | "x" | "google";
  title: string;
  clientId: string;
  scopes: string[];
  callbackUrl: string;
  configured: boolean;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.cardTitleRow}>
        <h2>{title}</h2>
        <State ready={configured} />
      </div>
      <form action={configureOAuthProviderFromMaster} className={styles.form} autoComplete="off">
        <input name="provider" type="hidden" value={provider} />
        <label className={styles.field}>
          <span>Client ID</span>
          <input
            name="clientId"
            defaultValue={clientId}
            placeholder="Developer App の Client ID"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            required
          />
        </label>
        <label className={styles.field}>
          <span>Client Secret</span>
          <input
            name="clientSecret"
            type="password"
            placeholder={configured ? "変更するときだけ新しいSecretを入力" : "Client Secret"}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            required
          />
        </label>
        <label className={styles.field}>
          <span>Scopes</span>
          <textarea
            name="scopes"
            defaultValue={scopes.join("\n")}
            rows={provider === "google" ? 6 : 5}
          />
        </label>
        <div className={styles.callbackBox}>
          <span>Callback URL</span>
          <code>{callbackUrl}</code>
        </div>
        <button className={styles.primaryButton} type="submit">
          {configured ? "設定を更新" : "設定を保存"}
        </button>
      </form>
    </article>
  );
}

const STATUS_MESSAGES: Record<string, string> = {
  "line-saved": "LINEの接続情報を保存し、Webhookを再設定しました。",
  "line-repaired": "LINE Webhookの再設定を実行しました。",
  "line-invalid": "LINEのChannel ID / Channel Secretを確認してください。",
  "line-error": "LINE設定を更新できませんでした。稼働状況を確認してください。",
  "instagram-saved": "Instagram / Meta のDeveloper App設定を保存しました。",
  "instagram-error": "Instagram / Meta の設定を保存できませんでした。",
  "x-saved": "X のDeveloper App設定を保存しました。",
  "x-error": "X の設定を保存できませんでした。",
  "google-saved": "Google / Gmail のDeveloper App設定を保存しました。",
  "google-error": "Google / Gmail の設定を保存できませんでした。",
  "provider-invalid": "Client ID / Client Secretを確認してください。",
  "ai-saved": "AI接続設定を保存し、OpenAI APIへの接続確認が完了しました。",
  "ai-invalid": "OpenAI APIキーまたはモデル名を確認してください。",
  "ai-error": "AI接続設定を保存できませんでした。Bridgeの稼働状況をご確認ください。",
};

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await hasMasterSession())) {
    redirect("/master-login");
  }

  const [line, instagram, x, google, aiRuntime] = await Promise.all([
    getLineHealth(),
    getProviderConfig("instagram", APP_ORIGIN),
    getProviderConfig("x", APP_ORIGIN),
    getProviderConfig("google", APP_ORIGIN),
    getAiRuntimeConfig(),
  ]);
  const params = await searchParams;
  const statusMessage = params.status ? STATUS_MESSAGES[params.status] : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>OmniBox Operations</p>
            <h1>運営側 設定・稼働確認</h1>
            <p>
              SNS連携に必要なDeveloper App設定と稼働状態を、ここで一元管理します。
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.link} href="/omnibox.html">
              OmniBoxを開く
            </Link>
            <form action={masterLogout}>
              <button className={styles.logout} type="submit">
                マスターログアウト
              </button>
            </form>
          </div>
        </header>

        {statusMessage ? (
          <div className={styles.notice}>{statusMessage}</div>
        ) : null}

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>マスター認証</h2>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span>マスターパスワード</span>
                <State ready={isMasterConfigured()} />
              </div>
              <div className={styles.row}>
                <span>セッション</span>
                <span className={styles.ready}>ログイン中</span>
              </div>
            </div>
          </article>

          <article className={styles.card + " " + styles.cardWide}>
            <div className={styles.cardTitleRow}>
              <h2>AI返信アシスタント</h2>
              <State
                ready={Boolean(aiRuntime)}
                readyText="接続済み"
                pendingText="要設定"
              />
            </div>
            <div className={styles.lineLayout}>
              <div>
                <div className={styles.rows}>
                  <div className={styles.row}>
                    <span>AI実行環境</span>
                    <State
                      ready={Boolean(aiRuntime)}
                      readyText="利用可能"
                      pendingText="未接続"
                    />
                  </div>
                  <div className={styles.row}>
                    <span>接続方式</span>
                    <span className={styles.value}>
                      {aiRuntime?.provider === "gateway"
                        ? "Vercel AI Gateway"
                        : aiRuntime
                          ? "OpenAI API"
                          : "未設定"}
                    </span>
                  </div>
                  <div className={styles.row}>
                    <span>モデル</span>
                    <span className={styles.value}>
                      {aiRuntime?.model ?? "gpt-6-luna"}
                    </span>
                  </div>
                  {aiRuntime ? (
                    <div className={styles.row}>
                      <span>設定元</span>
                      <span className={styles.value}>
                        {aiRuntime.source === "stored"
                          ? "運営設定（暗号化保存）"
                          : "サーバー環境変数"}
                      </span>
                    </div>
                  ) : null}
                </div>
                <p className={styles.note}>
                  OpenAI APIキーはRender Bridgeで暗号化して保存します。画面や通常ユーザーには公開されません。
                </p>
              </div>

              <form action={configureAiFromMaster} className={styles.form} autoComplete="off">
                <label className={styles.field}>
                  <span>OpenAI API Key</span>
                  <input
                    name="apiKey"
                    type="password"
                    placeholder={
                      aiRuntime?.source === "stored"
                        ? "変更するときだけ新しいAPIキーを入力"
                        : "sk-..."
                    }
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    required={!aiRuntime}
                  />
                </label>
                <label className={styles.field}>
                  <span>モデル</span>
                  <input
                    name="model"
                    defaultValue={aiRuntime?.model ?? "gpt-6-luna"}
                    placeholder="gpt-6-luna"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </label>
                <p className={styles.note}>
                  保存時にOpenAI APIへの接続確認を行います。日常的な返信案生成には、速度とコストのバランスから gpt-6-luna を初期値にしています。
                </p>
                <button className={styles.primaryButton} type="submit">
                  {aiRuntime?.source === "stored"
                    ? "AI設定を更新・接続確認"
                    : "AI設定を保存・接続確認"}
                </button>
              </form>
            </div>
          </article>

          <article className={styles.card + " " + styles.cardWide}>
            <div className={styles.cardTitleRow}>
              <h2>LINE Messaging API</h2>
              <State
                ready={
                  line.available &&
                  line.lineConnected &&
                  line.lineApiReachable === true &&
                  line.webhookActive === true &&
                  line.webhookMatches === true
                }
                readyText="正常"
                pendingText="要確認"
              />
            </div>

            <div className={styles.lineLayout}>
              <div>
                <div className={styles.rows}>
                  <div className={styles.row}>
                    <span>Bridge</span>
                    <State ready={line.available && line.configured} readyText="稼働中" />
                  </div>
                  <div className={styles.row}>
                    <span>LINE接続情報</span>
                    <State ready={line.lineConnected} />
                  </div>
                  <div className={styles.row}>
                    <span>LINE API疎通</span>
                    <State
                      ready={line.lineApiReachable === true}
                      readyText="確認済み"
                      pendingText={line.lineApiReachable === null ? "未診断" : "要確認"}
                    />
                  </div>
                  <div className={styles.row}>
                    <span>Webhook有効</span>
                    <State
                      ready={line.webhookActive === true}
                      readyText="有効"
                      pendingText={line.webhookActive === null ? "未診断" : "無効"}
                    />
                  </div>
                  <div className={styles.row}>
                    <span>Webhook URL一致</span>
                    <State
                      ready={line.webhookMatches === true}
                      readyText="一致"
                      pendingText={line.webhookMatches === null ? "未診断" : "不一致"}
                    />
                  </div>
                  {line.webhookUrl ? (
                    <div className={styles.row}>
                      <span>現在のWebhook</span>
                      <span className={styles.value}>{line.webhookUrl}</span>
                    </div>
                  ) : null}
                </div>
                <form action={repairLineFromMaster} className={styles.inlineForm}>
                  <button className={styles.secondaryButton} type="submit">
                    Webhookを診断・再設定
                  </button>
                </form>
              </div>

              <form action={configureLineFromMaster} className={styles.form} autoComplete="off">
                <label className={styles.field}>
                  <span>Channel ID</span>
                  <input
                    name="channelId"
                    inputMode="numeric"
                    placeholder="LINE Developers の Channel ID"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Channel Secret</span>
                  <input
                    name="channelSecret"
                    type="password"
                    placeholder="Messaging API の Channel Secret"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    required
                  />
                </label>
                <p className={styles.note}>
                  保存すると認証情報を暗号化して更新し、Webhook URLの登録と疎通確認まで実行します。
                </p>
                <button className={styles.primaryButton} type="submit">
                  LINE設定を保存・接続
                </button>
              </form>
            </div>
          </article>

          <ProviderForm
            provider="instagram"
            title="Instagram / Meta"
            clientId={instagram?.clientId ?? ""}
            scopes={
              instagram?.scopes ?? [
                "instagram_business_basic",
                "instagram_business_manage_messages",
                "instagram_business_content_publish",
              ]
            }
            callbackUrl={`${APP_ORIGIN}/api/omnibox/oauth/instagram/callback`}
            configured={Boolean(instagram)}
          />

          <ProviderForm
            provider="x"
            title="X"
            clientId={x?.clientId ?? ""}
            scopes={
              x?.scopes ?? [
                "tweet.read",
                "tweet.write",
                "users.read",
                "dm.read",
                "dm.write",
                "offline.access",
              ]
            }
            callbackUrl={`${APP_ORIGIN}/api/omnibox/oauth/x/callback`}
            configured={Boolean(x)}
          />

          <ProviderForm
            provider="google"
            title="Google / Gmail"
            clientId={google?.clientId ?? ""}
            scopes={
              google?.scopes ?? [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
              ]
            }
            callbackUrl={`${APP_ORIGIN}/api/omnibox/oauth/google/callback`}
            configured={Boolean(google)}
          />

          <article className={styles.card}>
            <h2>店舗側の接続操作</h2>
            <p className={styles.note}>
              Developer Appの設定はこの運営画面で管理します。設定完了後、店舗側はOmniBoxの「接続アカウント」から公式認証画面へ進んでアカウントを許可するだけです。
            </p>
            <div className={styles.actions}>
              <Link className={styles.link} href="/omnibox.html">
                接続アカウントを開く
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
