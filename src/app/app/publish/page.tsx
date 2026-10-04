import { SectionPage } from "../section-page";
import styles from "../section-page.module.css";

export default function PublishPage() {
  return (
    <SectionPage
      active="publish"
      title="SNS一括・予約投稿マネージャー"
      description="Instagram、X、Googleビジネスプロフィール等への投稿管理をここへ統合します。"
    >
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>予約投稿</h2>
          <p>元デモの予約投稿UIを移植する予定です。現時点では外部SNSへ実送信する処理はまだ接続していません。</p>
          <span className={`${styles.badge} ${styles.pending}`}>実連携は次段階</span>
        </section>
        <section className={styles.card}>
          <h2>投稿先アカウント</h2>
          <p>LINE以外のSNS OAuth実装後、ここに接続済みアカウントを表示します。</p>
          <span className={`${styles.badge} ${styles.pending}`}>未接続</span>
        </section>
      </div>
    </SectionPage>
  );
}
