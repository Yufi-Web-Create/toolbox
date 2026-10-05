import Link from "next/link";

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
          <Link className={styles.logoMark} href="/master-login" aria-label="運営マスターログイン">
            <img src="/matomeet-symbol.svg" alt="" />
          </Link>
          <h1><span>Mato</span>Meet</h1>
          <p>問い合わせを、ひとつに。毎日の顧客対応をもっとやさしく。</p>
        </div>
        <LoginForm
          callbackErrorMessage={callbackErrorMessage}
          nextPath={nextPath}
        />
      </section>
    </main>
  );
}
