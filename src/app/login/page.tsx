import { LoginForm } from "./login-form";
import { getCallbackErrorMessage, getSafeNextPath } from "./validation";
import styles from "./page.module.css";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackErrorMessage = getCallbackErrorMessage(
    getSingleValue(params.error),
  );
  const nextPath = getSafeNextPath(getSingleValue(params.next));

  return (
    <main className={styles.page}>
      <section className={styles.portal}>
        <div className={styles.hero}>
          <div className={styles.logoMark}>◫</div>
          <h1>OmniBox ポータル</h1>
          <p>複数SNSのメッセージ一元管理 &amp; 予約投稿ハブ</p>
        </div>
        <LoginForm
          callbackErrorMessage={callbackErrorMessage}
          nextPath={nextPath}
        />
      </section>
    </main>
  );
}
