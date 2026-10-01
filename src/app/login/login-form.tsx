"use client";

import Link from "next/link";
import { useActionState } from "react";

import { login, type LoginState } from "./actions";

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

  return (
    <>
      {callbackErrorMessage ? <p role="alert">{callbackErrorMessage}</p> : null}

      <form action={formAction}>
        <input name="next" type="hidden" value={nextPath} />

        <div>
          <label htmlFor="email">Email</label>
          <input
            autoComplete="email"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        <button disabled={isPending} type="submit">
          {isPending ? "Logging in…" : "Log in"}
        </button>

        {state.message ? (
          <p aria-live="polite" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>

      <p>
        Need an account? <Link href="/signup">Create one</Link>
      </p>
    </>
  );
}
