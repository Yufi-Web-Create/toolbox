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
        {isPending ? "Creating account…" : "Create account"}
      </button>

      {state.message ? (
        <p aria-live="polite" role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
