"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  masterLogin,
  type MasterLoginState,
} from "./actions";
import styles from "../login/page.module.css";

const initialState: MasterLoginState = {
  status: "idle",
  message: "",
};

export function MasterLoginForm() {
  const [state, formAction, isPending] = useActionState(
    masterLogin,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.body}>
      <div className={styles.tabs} aria-label="運営ログイン">
        <Link href="/login" className={styles.tab}>
          通常ログイン
        </Link>
        <span className={styles.tabActive}>運営マスター</span>
      </div>

      <form action={formAction} className={styles.form}>
        <label className={styles.field}>
          <span>マスターパスワード</span>
          <div className={styles.passwordWrap}>
            <input
              autoComplete="current-password"
              name="password"
              required
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
            />
            <button
              type="button"
              className={styles.eyeButton}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPassword ? "非表示" : "表示"}
            </button>
          </div>
        </label>

        <p className={styles.masterHint}>
          OmniBox運営担当者専用です。通常の店舗・スタッフアカウントとは別の入口です。
        </p>

        <button className={styles.submit} disabled={isPending} type="submit">
          {isPending ? "確認中..." : "運営設定へログイン"}
        </button>

        {state.message ? (
          <p className={styles.error} aria-live="polite" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>

      <div className={styles.footer}>© 2026 OmniBox Cloud Services.</div>
    </div>
  );
}
