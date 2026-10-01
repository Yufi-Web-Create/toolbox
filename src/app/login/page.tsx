import { LoginForm } from "./login-form";
import { getCallbackErrorMessage, getSafeNextPath } from "./validation";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackErrorMessage = getCallbackErrorMessage(
    getSingleValue(params.error),
  );
  const nextPath = getSafeNextPath(getSingleValue(params.next));

  return (
    <main>
      <h1>Log in</h1>
      <LoginForm
        callbackErrorMessage={callbackErrorMessage}
        nextPath={nextPath}
      />
    </main>
  );
}
