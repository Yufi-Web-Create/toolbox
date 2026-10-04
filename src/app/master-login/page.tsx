import { redirect } from "next/navigation";

import { hasMasterSession } from "../../lib/master-auth";
import { MasterLoginForm } from "./master-login-form";
import styles from "../login/page.module.css";

export default async function MasterLoginPage() {
  if (await hasMasterSession()) {
    redirect("/master");
  }

  return (
    <main className={styles.page}>
      <section className={styles.portal}>
        <div className={styles.hero}>
          <div className={styles.logoMark} aria-hidden="true">◫</div>
          <h1>OmniBox 運営設定</h1>
          <p>Master Operations Console</p>
        </div>
        <MasterLoginForm />
      </section>
    </main>
  );
}
