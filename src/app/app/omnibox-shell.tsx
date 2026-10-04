import Link from "next/link";

import { logout } from "../logout/actions";
import styles from "./omnibox-shell.module.css";

type OmniBoxShellProps = {
  active: "inbox" | "publish" | "templates" | "channels" | "analytics";
  userEmail?: string | null;
  children: React.ReactNode;
};

const navItems = [
  { key: "inbox", label: "受信箱", href: "/app/inbox" },
  { key: "publish", label: "SNS一括・予約投稿", href: "/app/publish" },
  { key: "templates", label: "定型文・業界パック", href: "/app/templates" },
  { key: "channels", label: "連携アカウント", href: "/app/channels" },
  { key: "analytics", label: "分析", href: "/app/analytics" },
] as const;

export function OmniBoxShell({
  active,
  userEmail,
  children,
}: OmniBoxShellProps) {
  const avatar = userEmail?.trim()?.slice(0, 1).toUpperCase() || "担";

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/app/inbox" className={styles.brand}>
          <span className={styles.logo}>◫</span>
          <span>
            <span className={styles.brandLine}>
              <strong>OmniBox</strong>
              <span className={styles.cloud}>
                <i /> Cloud Sync 有効
              </span>
            </span>
            <small>複数SNS一元管理 &amp; 予約投稿ハブ</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="メインナビゲーション">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={active === item.key ? styles.navActive : styles.navItem}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.userArea}>
          <div className={styles.avatar}>{avatar}</div>
          <div className={styles.userText}>
            <strong>ログイン中</strong>
            <span>{userEmail || "OmniBox user"}</span>
          </div>
          <form action={logout}>
            <button className={styles.logout} type="submit">ログアウト</button>
          </form>
        </div>
      </header>

      <nav className={styles.mobileNav} aria-label="モバイルナビゲーション">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={active === item.key ? styles.mobileActive : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={styles.content}>{children}</div>
    </div>
  );
}
