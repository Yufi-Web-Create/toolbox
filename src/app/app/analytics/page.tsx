import { SectionPage } from "../section-page";
import styles from "../section-page.module.css";

export default function AnalyticsPage() {
  return (
    <SectionPage
      active="analytics"
      title="問い合わせ対応 & SNSパフォーマンス分析"
      description="各チャネルの受信状況、対応完了率、担当者別アクティビティを可視化する画面です。"
    >
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>問い合わせKPI</h2>
          <p>実データ集計はまだ接続していません。受信箱データを基に集計する実装を次段階で追加します。</p>
          <span className={`${styles.badge} ${styles.pending}`}>集計ロジック未接続</span>
        </section>
        <section className={styles.card}>
          <h2>チャネル別分析</h2>
          <p>LINE以外のチャネル実連携後、媒体別の問い合わせ件数や対応状況をここに表示します。</p>
          <span className={`${styles.badge} ${styles.pending}`}>データ待ち</span>
        </section>
      </div>
    </SectionPage>
  );
}
