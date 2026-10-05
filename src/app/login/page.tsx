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

function MatoMeetSymbol() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7 11.5c0-3.04 2.46-5.5 5.5-5.5h17A5.5 5.5 0 0 1 35 11.5v10a5.5 5.5 0 0 1-5.5 5.5H19l-7.5 6v-6.1A5.5 5.5 0 0 1 7 21.5v-10Z" />
      <path d="M19 20.5c0-3.04 2.46-5.5 5.5-5.5h11a5.5 5.5 0 0 1 5.5 5.5v9a5.5 5.5 0 0 1-5.5 5.5H34v6l-7.5-6h-2A5.5 5.5 0 0 1 19 29.5v-9Z" />
    </svg>
  );
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
          <Link className={styles.logoMark} href="/master-login" aria-label="運営マスターログイン"><MatoMeetSymbol /></Link>
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
