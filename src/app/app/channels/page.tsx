import { SectionPage } from "../section-page";
import styles from "../section-page.module.css";

export default function ChannelsPage() {
  return (
    <SectionPage
      active="channels"
      title="接続アカウント & Webhook連携設定"
      description="各SNS・メール窓口をMatoMeetへ接続する管理画面です。"
    >
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>LINE公式アカウント</h2>
          <p>LINE受信・返信用のRenderブリッジはすでにデプロイ済みです。資格情報を設定すると実通信を開始できます。</p>
          <span className={styles.badge}>サーバー稼働中</span>
          <div className={styles.endpoint}>https://omnibox-line-bridge.onrender.com/webhooks/line</div>
        </section>
        <section className={styles.card}>
          <h2>Instagram / X / Google</h2>
          <p>元デモのOAuth導線をこの画面へ移植しますが、実際のOAuth認可はまだ接続していません。</p>
          <span className={`${styles.badge} ${styles.pending}`}>OAuth未実装</span>
        </section>
      </div>
    </SectionPage>
  );
}
