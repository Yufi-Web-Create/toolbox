import Link from "next/link";
import { redirect } from "next/navigation";

import { getInboxSnapshot } from "../../../lib/inbox/server";
import { getVisibleOrganizationStatus } from "../../../lib/organizations/server";
import { createClient } from "../../../lib/supabase/server";
import { OmniBoxShell } from "../omnibox-shell";
import { ReplyForm } from "./reply-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams: Promise<{ conversation?: string | string[] }>;
};

const STATUS_LABELS = {
  unread: "未対応",
  in_progress: "対応中",
  completed: "対応完了",
} as const;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  let claims: Record<string, unknown> | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    claims = !error && data?.claims ? (data.claims as Record<string, unknown>) : null;
  } catch {
    claims = null;
  }

  if (!claims) redirect("/login?next=/app/inbox");

  const organizationStatus = await getVisibleOrganizationStatus();
  if (!organizationStatus.success) {
    return (
      <OmniBoxShell active="inbox" userEmail={String(claims.email ?? "")}>
        <main className={styles.errorPage}>
          <section className={styles.centerCard}>
            <h1>受信箱を開けませんでした</h1>
            <p>{organizationStatus.message}</p>
          </section>
        </main>
      </OmniBoxShell>
    );
  }

  if (!organizationStatus.hasOrganization) redirect("/app/onboarding");

  const params = await searchParams;
  const requestedConversation =
    typeof params.conversation === "string" ? params.conversation : null;
  const inbox = await getInboxSnapshot(requestedConversation);

  if (!inbox.success) {
    return (
      <OmniBoxShell active="inbox" userEmail={String(claims.email ?? "")}>
        <main className={styles.errorPage}>
          <section className={styles.centerCard}>
            <h1>受信箱を開けませんでした</h1>
            <p>{inbox.message}</p>
          </section>
        </main>
      </OmniBoxShell>
    );
  }

  const unreadCount = inbox.conversations.filter((c) => c.status === "unread").length;
  const progressCount = inbox.conversations.filter((c) => c.status === "in_progress").length;
  const completedCount = inbox.conversations.filter((c) => c.status === "completed").length;

  return (
    <OmniBoxShell active="inbox" userEmail={String(claims.email ?? "")}>
      <main className={styles.inbox}>
        <aside className={styles.filters}>
          <div className={styles.searchBox}>
            <input type="search" placeholder="顧客名、本文、タグ検索..." aria-label="受信箱を検索" disabled />
          </div>
          <div className={styles.filterBody}>
            <section>
              <h2>ステータス</h2>
              <div className={styles.filterList}>
                <div className={styles.filterActive}><span>すべて</span><strong>{inbox.conversations.length}</strong></div>
                <div><span>未対応・未読</span><strong className={styles.redCount}>{unreadCount}</strong></div>
                <div><span>対応中</span><strong>{progressCount}</strong></div>
                <div><span>対応完了</span><strong>{completedCount}</strong></div>
              </div>
            </section>

            <section>
              <h2>連携アカウント・窓口</h2>
              <div className={styles.channelCard}>
                <span className={styles.lineDot} />
                <div><strong>LINE公式</strong><small>実接続用受信箱</small></div>
              </div>
              <Link href="/app/channels" className={styles.addLink}>＋ アカウント連携設定</Link>
            </section>

            <div className={styles.aiCard}>
              <strong>AIアシスタント</strong>
              <span>返信文案機能は次段階で接続予定です。</span>
            </div>
          </div>
        </aside>

        <section className={styles.threadColumn}>
          <div className={styles.threadHeader}>
            <div><strong>受信トレイ</strong><span>LINE公式・すべてのステータス</span></div>
            <span className={styles.liveBadge}>LIVE DATA</span>
          </div>

          <nav className={styles.threadList} aria-label="LINE会話一覧">
            {inbox.conversations.length === 0 ? (
              <div className={styles.threadEmpty}>
                <strong>問い合わせはまだありません</strong>
                <span>LINE接続後、ここに実際のメッセージが表示されます。</span>
              </div>
            ) : inbox.conversations.map((conversation) => {
              const selected = conversation.id === inbox.selectedConversation?.id;
              return (
                <Link
                  key={conversation.id}
                  href={`/app/inbox?conversation=${encodeURIComponent(conversation.id)}`}
                  className={selected ? `${styles.threadItem} ${styles.threadItemSelected}` : styles.threadItem}
                >
                  <div className={styles.threadAvatar}>
                    {conversation.customer_display_name.slice(0, 1)}
                    <span>LINE</span>
                  </div>
                  <div className={styles.threadMain}>
                    <div className={styles.threadTop}>
                      <strong>{conversation.customer_display_name}</strong>
                      <time>{formatDate(conversation.last_message_at)}</time>
                    </div>
                    <span className={styles.destination}>宛先: LINE公式</span>
                    <p>{conversation.last_message_preview}</p>
                    <div className={styles.threadBottom}>
                      <span>担当: 未割り当て</span>
                      <em>{STATUS_LABELS[conversation.status]}</em>
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>
        </section>

        <section className={styles.chatPane}>
          {inbox.selectedConversation ? (
            <>
              <header className={styles.chatHeader}>
                <div className={styles.customer}>
                  <div className={styles.customerAvatar}>
                    {inbox.selectedConversation.customer_display_name.slice(0, 1)}
                    <span>LINE</span>
                  </div>
                  <div>
                    <div className={styles.customerTitle}>
                      <h1>{inbox.selectedConversation.customer_display_name}</h1>
                      <span>{STATUS_LABELS[inbox.selectedConversation.status]}</span>
                    </div>
                    <p>{inbox.selectedConversation.customer_external_id}</p>
                  </div>
                </div>
                <div className={styles.chatMeta}>
                  <span>宛先: LINE公式</span>
                  <small>実データ</small>
                </div>
              </header>

              <div className={styles.messages} aria-label="メッセージ履歴">
                {inbox.messages.length === 0 ? (
                  <div className={styles.noMessages}>メッセージはありません。</div>
                ) : inbox.messages.map((message) => (
                  <article
                    key={message.id}
                    className={message.direction === "outbound"
                      ? `${styles.messageRow} ${styles.messageRowOutbound}`
                      : styles.messageRow}
                  >
                    <div className={message.direction === "outbound"
                      ? `${styles.messageBubble} ${styles.messageBubbleOutbound}`
                      : styles.messageBubble}
                    >
                      <p>{message.body}</p>
                      <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                    </div>
                  </article>
                ))}
              </div>

              <div className={styles.replyDock}>
                <div className={styles.replyTools}>
                  <span>AI丁寧返信</span>
                  <span>親しみやすい返信</span>
                  <span>定型文挿入</span>
                </div>
                <ReplyForm conversationId={inbox.selectedConversation.id} />
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <strong>スレッドが選択されていません</strong>
              <span>左側のリストから確認・返信したいメッセージを選択してください。</span>
            </div>
          )}
        </section>
      </main>
    </OmniBoxShell>
  );
}
