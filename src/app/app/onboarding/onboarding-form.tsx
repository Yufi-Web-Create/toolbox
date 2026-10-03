"use client";

import { useActionState } from "react";

import { createOrganization, type OnboardingState } from "./actions";

const initialState: OnboardingState = {
  status: "idle",
  message: "",
};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(
    createOrganization,
    initialState,
  );

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="organization-name">Organization name</label>
        <input
          autoComplete="organization"
          id="organization-name"
          name="organizationName"
          required
          type="text"
        />
      </div>

      <button disabled={isPending} type="submit">
        {isPending ? "Creating workspace…" : "Create workspace"}
      </button>

      {state.message ? (
        <p aria-live="polite" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
