import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_NAME } from "../../lib/legal";

export const metadata: Metadata = {
  title: "データ削除について | MatoMeet",
  robots: { index: true },
};

const sectionStyle = { display: "grid", gap: "0.75rem" } as const;

export default function DataDeletionPage() {
  return (
    <main style={{ display: "block", minHeight: "100vh", padding: "clamp(1.5rem, 5vw, 4rem) 1.25rem", textAlign: "left" }}>
      <article style={{ width: "100%", maxWidth: "760px", margin: "0 auto", display: "grid", gap: "2rem", lineHeight: 1.8 }}>
        <header style={{ display: "grid", gap: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 5vw, 2.5rem)", lineHeight: 1.3 }}>データ削除について</h1>
          <p>{LEGAL_EFFECTIVE_DATE}</p>
        </header>

        <p>本サービス「MatoMeet」に保存されている利用者のデータは、次のいずれかの方法で削除できます。</p>

        <section style={sectionStyle}>
          <h2>1. Instagram等の連携を解除する</h2>
          <ol>
            <li>MatoMeetにログインし、「連携」画面を開きます。</li>
            <li>削除したいアカウントのカードにある「連携解除」を選びます。</li>
          </ol>
          <p>連携を解除すると、そのアカウントのアクセストークンは直ちに削除され、本サービスからそのアカウントへのアクセスはできなくなります。</p>
        </section>

        <section style={sectionStyle}>
          <h2>2. Instagram側からアクセス許可を取り消す</h2>
          <p>Instagramの「設定 → アプリとウェブサイト」から「OmniBox-IG」を削除することでも、本サービスへのアクセス許可を取り消せます。</p>
        </section>

        <section style={sectionStyle}>
          <h2>3. すべてのデータの削除を依頼する</h2>
          <p>保存済みのメッセージ履歴、投稿データ、アカウント情報を含むすべてのデータの削除を希望する場合は、件名を「データ削除依頼」とし、次の内容を記載して{CONTACT_EMAIL}までご連絡ください。</p>
          <ul>
            <li>本サービスに登録しているメールアドレス</li>
            <li>削除を希望する連携アカウント（例：Instagramのユーザー名）</li>
          </ul>
          <p>ご本人確認のうえ、原則として30日以内に削除し、完了をメールでお知らせします。</p>
          <p>運営者：{OPERATOR_NAME}</p>
        </section>

        <footer style={{ borderTop: "1px solid #e5e5e5", paddingTop: "1.5rem" }}>
          <Link href="/privacy">プライバシーポリシー</Link>
        </footer>
      </article>
    </main>
  );
}
