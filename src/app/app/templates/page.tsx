import { SectionPage } from "../section-page";
import styles from "../section-page.module.css";

export default function TemplatesPage() {
  return (
    <SectionPage
      active="templates"
      title="定型文 & 業界別テンプレートパック"
      description="頻出返信文を保存し、受信箱から呼び出せる機能をこの画面へ移植します。"
    >
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>定型文</h2>
          <p>サロン、飲食、EC、企業問い合わせ向けなど、既存デモのカテゴリ構成を引き継ぎます。</p>
          <span className={`${styles.badge} ${styles.pending}`}>DB保存は次段階</span>
        </section>
        <section className={styles.card}>
          <h2>受信箱への挿入</h2>
          <p>今後、選択した定型文をLINE返信欄へ直接挿入できるように接続します。</p>
          <span className={`${styles.badge} ${styles.pending}`}>接続予定</span>
        </section>
      </div>
    </SectionPage>
  );
}
