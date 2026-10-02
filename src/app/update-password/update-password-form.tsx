"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updatePassword, type UpdatePasswordState } from "./actions";

const initialState: UpdatePasswordState = {
  status: "idle",
  message: "",
};

export function UpdatePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    initialState,
  );

  return (
    <>
      <form action={formAction}>
        <div>
          <label htmlFor="password">New password</label>
          <input
            aria-describedby="password-requirement"
            autoComplete="new-password"
            id="password"
            minLength={8}
            name="password"
            required
            type="password"
          />
          <p id="password-requirement">Use at least 8 characters.</p>
        </div>

        <button disabled={isPending} type="submit">
          {isPending ? "Updating…" : "Update password"}
        </button>

        {state.message ? (
          <p aria-live="polite" role="alert">
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
