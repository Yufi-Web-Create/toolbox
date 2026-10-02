"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = {
  status: "idle",
  message: "",
};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <>
      <form action={formAction}>
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

        <button disabled={isPending} type="submit">
          {isPending ? "Sending…" : "Send reset instructions"}
        </button>

        {state.message ? (
          <p aria-live="polite" role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
        ) : null}
      </form>

      <p>
        <Link href="/login">Back to login</Link>
      </p>
    </>
  );
}
