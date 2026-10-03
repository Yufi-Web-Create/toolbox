import Link from "next/link";
import { redirect } from "next/navigation";

import { getVisibleOrganizationStatus } from "../../../lib/organizations/server";
import { getInboxSnapshot } from "../../../lib/inbox/server";
import { createClient } from "../../../lib/supabase/server";
import { ReplyForm } from "./reply-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams: Promise<{
    conversation?: string | string[];
  }>;
};

const STATUS_LABELS = {
  unread: "未対応",
  in_progress: "対応中",
  completed: "対応完了",
} as const;

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  let authenticated = false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && Boolean(data?.claims);
  } catch {
    authenticated = false;
  }

  if (!authenticated) {
    redirect("/login?next=/app/inbox");
  }

  const organizationStatus = await getVisibleOrganizationStatus();

  if (!organizationStatus.success) {
    return (
      <main className={styles.page}>
        <section className={styles.centerCard}>
          <h1>受信箱を開けませんでした</h1>
          <p>{organizationStatus.message}</p>
        </section>
      </main>
    );
  }

  if (!organizationStatus.hasOrganization) {
    redirect("/app/onboarding");
  }

  const params = await searchParams;
  const requestedConversation =
    typeof params.conversation === "string" ? params.conversation : null;
  const inbox = await getInboxSnapshot(requestedConversation);

  if (!inbox.success) {
    return (
      <main className={styles.page}>
        <section className={styles.centerCard}>
          <h1>受信箱を開けませんでした</h1>
          <p>{inbox.message}</p>
          <Link href="/app" className={styles.textLink}>
            アプリへ戻る
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OmniBox</p>
          <h1>LINE受信箱</h1>
          <p className={styles.subtitle}>
            LINEから届いた問い合わせを確認し、この画面から返信できます。
          </p>
        </div>
        <Link href="/app" className={styles.backLink}>
          アプリへ戻る
        </Link>
      </header>

      {inbox.conversations.length === 0 ? (
        <section className={styles.emptyState}>
          <div className={styles.lineBadge}>LINE</div>
          <h2>LINEメッセージはまだありません</h2>
          <p>
            LINE公式アカウントのWebhook接続後、受信したメッセージがここに表示されます。
          </p>
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.threadPanel}>
            <div className={styles.panelHeading}>
              <span>会話</span>
              <span>{inbox.conversations.length}件</span>
            </div>
            <nav className={styles.threadList} aria-label="LINE会話一覧">
              {inbox.conversations.map((conversation) => {
                const selected =
                  conversation.id === inbox.selectedConversation?.id;

                return (
                  <Link
                    key={conversation.id}
                    href={`/app/inbox?conversation=${encodeURIComponent(conversation.id)}`}
                    className={
                      selected
                        ? `${styles.threadItem} ${styles.threadItemSelected}`
                        : styles.threadItem
                    }
                  >
                    <div className={styles.threadTopRow}>
                      <strong>{conversation.customer_display_name}</strong>
                      <span>{formatDate(conversation.last_message_at)}</span>
                    </div>
                    <p>{conversation.last_message_preview}</p>
                    <div className={styles.threadMeta}>
                      <span className={styles.lineMiniBadge}>LINE</span>
                      <span>{STATUS_LABELS[conversation.status]}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <section className={styles.chatPanel}>
            {inbox.selectedConversation ? (
              <>
                <div className={styles.chatHeader}>
                  <div>
                    <p className={styles.eyebrow}>LINE</p>
                    <h2>{inbox.selectedConversation.customer_display_name}</h2>
                    <p className={styles.customerId}>
                      {inbox.selectedConversation.customer_external_id}
                    </p>
                  </div>
                  <span className={styles.statusPill}>
                    {STATUS_LABELS[inbox.selectedConversation.status]}
                  </span>
                </div>

                <div className={styles.messages} aria-label="メッセージ履歴">
                  {inbox.messages.length === 0 ? (
                    <p className={styles.noMessages}>メッセージはありません。</p>
                  ) : (
                    inbox.messages.map((message) => (
                      <article
                        key={message.id}
                        className={
                          message.direction === "outbound"
                            ? `${styles.messageRow} ${styles.messageRowOutbound}`
                            : styles.messageRow
                        }
                      >
                        <div
                          className={
                            message.direction === "outbound"
                              ? `${styles.messageBubble} ${styles.messageBubbleOutbound}`
                              : styles.messageBubble
                          }
                        >
                          <p>{message.body}</p>
                          <time dateTime={message.created_at}>
                            {formatDate(message.created_at)}
                          </time>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <ReplyForm conversationId={inbox.selectedConversation.id} />
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
