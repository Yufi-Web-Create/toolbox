import Link from "next/link";
import { redirect } from "next/navigation";

import {
  hasMasterSession,
  isMasterConfigured,
} from "../../lib/master-auth";
import { masterLogout } from "./actions";
import styles from "./page.module.css";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

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

export default async function MasterPage() {
  if (!(await hasMasterSession())) {
    redirect("/master-login");
  }

  const line = await getLineHealth();
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const aiModel = process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
  const instagramConfigured = Boolean(
    process.env.OMNIBOX_INSTAGRAM_CLIENT_ID?.trim() &&
      process.env.OMNIBOX_INSTAGRAM_CLIENT_SECRET?.trim(),
  );
  const xConfigured = Boolean(
    process.env.OMNIBOX_X_CLIENT_ID?.trim() &&
      process.env.OMNIBOX_X_CLIENT_SECRET?.trim(),
  );
  const googleConfigured = Boolean(
    process.env.OMNIBOX_GOOGLE_CLIENT_ID?.trim() &&
      process.env.OMNIBOX_GOOGLE_CLIENT_SECRET?.trim(),
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>OmniBox Operations</p>
            <h1>運営側 設定・稼働確認</h1>
            <p>秘密値そのものは表示せず、設定有無と接続状態だけを確認できます。</p>
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
            <p className={styles.note}>
              パスワードはサーバー環境変数で管理し、ブラウザには署名済みセッションだけを保存します。
            </p>
          </article>

          <article className={styles.card}>
            <h2>AI返信アシスタント</h2>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span>OpenAI API</span>
                <State ready={aiConfigured} />
              </div>
              <div className={styles.row}>
                <span>モデル</span>
                <span className={styles.value}>{aiModel}</span>
              </div>
            </div>
            <p className={styles.note}>
              AI対応プランの受信箱から返信案を作成します。生成した文章は自動送信されません。
            </p>
          </article>

          <article className={styles.card + " " + styles.cardWide}>
            <h2>LINE Messaging API</h2>
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
          </article>

          <article className={styles.card}>
            <h2>SNS Developer App</h2>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span>Instagram / Meta</span>
                <State ready={instagramConfigured} />
              </div>
              <div className={styles.row}>
                <span>X</span>
                <State ready={xConfigured} />
              </div>
              <div className={styles.row}>
                <span>Google / Gmail</span>
                <State ready={googleConfigured} />
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <h2>接続作業</h2>
            <p className={styles.note}>
              顧客側の接続操作はOmniBoxの「接続アカウント」に集約しています。各サービスのDeveloper Consoleで必要な準備とCallback URLも同画面に表示します。
            </p>
            <div className={styles.actions}>
              <Link className={styles.link} href="/omnibox.html">
                接続アカウントを確認
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
