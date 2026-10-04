"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { login, type LoginState } from "./actions";
import styles from "./page.module.css";

const initialState: LoginState = {
  status: "idle",
  message: "",
};

type LoginFormProps = {
  callbackErrorMessage: string | null;
  nextPath: string;
};

export function LoginForm({ callbackErrorMessage, nextPath }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.body}>
      <div className={styles.tabs} aria-label="認証メニュー">
        <span className={styles.tabActive}>ログイン</span>
        <Link href="/signup" className={styles.tab}>スタッフ新規登録</Link>
      </div>

      {callbackErrorMessage ? (
        <p className={styles.error} role="alert">{callbackErrorMessage}</p>
      ) : null}

      <form action={formAction} className={styles.form}>
        <input name="next" type="hidden" value={nextPath} />

        <label className={styles.field}>
          <span>ログインID</span>
          <input
            autoComplete="username"
            autoCapitalize="none"
            id="loginId"
            name="loginId"
            required
            minLength={3}
            maxLength={32}
            type="text"
            placeholder="sample_admin"
          />
        </label>

        <label className={styles.field}>
          <div className={styles.labelRow}>
            <span>パスワード</span>
            <span>8文字以上</span>
          </div>
          <div className={styles.passwordWrap}>
            <input
              autoComplete="current-password"
              id="password"
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

        <div className={styles.metaRow}>
          <label className={styles.remember}>
            <input type="checkbox" defaultChecked readOnly />
            <span>ログイン状態を保持する</span>
          </label>
          <span className={styles.secure}>SSL暗号化通信</span>
        </div>

        <button className={styles.submit} disabled={isPending} type="submit">
          {isPending ? "認証中..." : "ログインして業務を開始"}
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
