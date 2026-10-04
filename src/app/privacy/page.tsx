import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_NAME } from "@/lib/legal";

export const metadata: Metadata = {
  title: "プライバシーポリシー | OmniBox",
  robots: { index: true },
};

const sectionStyle = { display: "grid", gap: "0.75rem" } as const;

export default function PrivacyPage() {
  return (
    <main style={{ display: "block", minHeight: "100vh", padding: "clamp(1.5rem, 5vw, 4rem) 1.25rem", textAlign: "left" }}>
      <article style={{ width: "100%", maxWidth: "760px", margin: "0 auto", display: "grid", gap: "2rem", lineHeight: 1.8 }}>
        <header style={{ display: "grid", gap: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 5vw, 2.5rem)", lineHeight: 1.3 }}>プライバシーポリシー</h1>
          <p>{LEGAL_EFFECTIVE_DATE}</p>
        </header>

        <p>{OPERATOR_NAME}（以下「運営者」）は、運営者が提供するサービス「toolbox」およびその機能「OmniBox」（以下「本サービス」）における利用者の情報の取り扱いについて、以下のとおり定めます。</p>

        <section style={sectionStyle}>
          <h2>1. 取得する情報</h2>
          <p>運営者は、本サービスの提供にあたり、次の情報を取得します。</p>
          <ul>
            <li>アカウント情報：メールアドレス、表示名、所属する組織（ワークスペース）の情報</li>
            <li>連携したSNS・メッセージサービスの情報：利用者が本サービスと連携したInstagram、LINE、X、Google等のアカウントID、ユーザー名、表示名、プロフィール画像、アクセストークン</li>
            <li>メッセージ・投稿の情報：連携アカウントで送受信したダイレクトメッセージ、コメント、その送信者の表示名・プロフィール画像・アカウントID、予約投稿の内容と画像</li>
            <li>利用状況の情報：アクセス日時、操作ログ、IPアドレス、ブラウザの種類等</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2>2. 利用目的</h2>
          <p>取得した情報は、次の目的に限り利用します。</p>
          <ul>
            <li>連携アカウントのメッセージを受信・表示し、利用者が返信できるようにするため</li>
            <li>利用者の指示に基づき、連携アカウントへ投稿・予約投稿を行うため</li>
            <li>利用者が要求した場合に、会話履歴をもとにAIによる返信案を生成するため</li>
            <li>本サービスの本人確認、不正利用の防止、障害対応、改善のため</li>
            <li>お問い合わせへの対応のため</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2>3. Meta（Instagram）から取得する情報の取り扱い</h2>
          <p>Instagram APIを通じて取得した情報は、上記2の目的のためにのみ利用し、広告目的での利用、データの販売、第三者への提供は行いません。取り扱いはMetaプラットフォーム利用規約および開発者ポリシーに従います。</p>
        </section>

        <section style={sectionStyle}>
          <h2>4. 第三者提供</h2>
          <p>運営者は、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。</p>
        </section>

        <section style={sectionStyle}>
          <h2>5. 外部サービスの利用（委託）</h2>
          <p>本サービスは、次の外部サービスを利用して運営しており、その範囲で情報が保存・処理されます。これらのサービスは日本国外のサーバーで情報を取り扱う場合があります。</p>
          <ul>
            <li>Supabase（データベース・認証・サーバー機能）</li>
            <li>Vercel（ウェブサイトのホスティング）</li>
            <li>Render（LINE連携の中継サーバー）</li>
            <li>返信案の生成に利用するAIサービス（利用者が返信案の生成を実行した場合のみ）</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2>6. 安全管理</h2>
          <p>アクセストークン等の認証情報は暗号化して保存し、組織ごとにアクセス権限を分離するなど、情報の漏えい・滅失を防ぐための措置を講じます。</p>
        </section>

        <section style={sectionStyle}>
          <h2>7. 保存期間</h2>
          <p>取得した情報は、利用者が連携を解除するか、アカウントを削除するまで保存します。連携解除または削除の後は、法令上保存が必要な場合を除き、速やかに削除します。</p>
        </section>

        <section style={sectionStyle}>
          <h2>8. データの削除・開示等の請求</h2>
          <p>利用者は、自己の情報の開示、訂正、利用停止、削除を求めることができます。手順は「データ削除について」（/data-deletion）をご覧ください。</p>
        </section>

        <section style={sectionStyle}>
          <h2>9. 改定</h2>
          <p>本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は、本サービス上でお知らせします。</p>
        </section>

        <section style={sectionStyle}>
          <h2>10. お問い合わせ</h2>
          <p>運営者：{OPERATOR_NAME} お問い合わせ：{CONTACT_EMAIL}</p>
        </section>

        <footer style={{ borderTop: "1px solid #e5e5e5", paddingTop: "1.5rem" }}>
          <Link href="/data-deletion">データ削除について</Link>
        </footer>
      </article>
    </main>
  );
}
