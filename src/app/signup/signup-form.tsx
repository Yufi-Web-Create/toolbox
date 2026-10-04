"use client";

import { useActionState } from "react";

import { signup, type SignupState } from "./actions";

const initialState: SignupState = {
  status: "idle",
  message: "",
};

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, initialState);

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="name">表示名</label>
        <input id="name" name="name" required type="text" maxLength={100} />
      </div>

      <div>
        <label htmlFor="loginId">ログインID</label>
        <input
          autoComplete="username"
          autoCapitalize="none"
          id="loginId"
          minLength={3}
          maxLength={32}
          name="loginId"
          required
          type="text"
          placeholder="sample_admin"
        />
      </div>

      <div>
        <label htmlFor="password">パスワード</label>
        <input
          aria-describedby="password-requirement"
          autoComplete="new-password"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p id="password-requirement">8文字以上で入力してください。</p>
      </div>

      <button disabled={isPending} type="submit">
        {isPending ? "作成中..." : "アカウントを作成"}
      </button>

      {state.message ? (
        <p aria-live="polite" role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
