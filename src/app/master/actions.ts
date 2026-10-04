"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  clearMasterSessionCookie,
  hasMasterSession,
} from "../../lib/master-auth";

const BRIDGE_URL =
  process.env.LINE_BRIDGE_URL?.trim() ||
  "https://omnibox-line-bridge.onrender.com";

function bridgeKey() {
  return process.env.OMNIBOX_PROVIDER_BRIDGE_KEY?.trim() ?? "";
}

async function requireMaster() {
  if (!(await hasMasterSession())) {
    redirect("/master-login");
  }
}

async function redirectWithStatus(status: string): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set("omnibox_master_status", status, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/master",
    maxAge: 15,
  });
  redirect("/master");
}

async function operatorBridgeRequest(path: string, payload: Record<string, unknown>) {
  const key = bridgeKey();
  if (!key) return { ok: false, error: "bridge_key_missing" };

  try {
    const response = await fetch(new URL(path, BRIDGE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-omnibox-provider-key": key,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: response.ok && data.ok === true,
      error: typeof data.error === "string" ? data.error : "",
    };
  } catch {
    return { ok: false, error: "bridge_unavailable" };
  }
}

export async function configureAiFromMaster(formData: FormData) {
  await requireMaster();

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim() || "gpt-6-luna";

  if (apiKey.length > 512 || model.length > 128 || !/^[a-z0-9][a-z0-9._:/-]*$/i.test(model)) {
    await redirectWithStatus("ai-invalid");
  }

  const result = await operatorBridgeRequest("/internal/operator/ai/configure", {
    apiKey,
    model,
  });

  revalidatePath("/master");
  await redirectWithStatus(
    result.ok
      ? "ai-saved"
      : result.error === "invalid_ai_key" ||
          result.error === "ai_key_rejected" ||
          result.error === "invalid_ai_model"
        ? "ai-invalid"
        : "ai-error",
  );
}

export async function configureOAuthProviderFromMaster(formData: FormData) {
  await requireMaster();

  const provider = String(formData.get("provider") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  const scopes = String(formData.get("scopes") ?? "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!["instagram", "x", "google"].includes(provider) || !clientId || !clientSecret) {
    await redirectWithStatus("provider-invalid");
  }

  const result = await operatorBridgeRequest("/internal/operator/provider/configure", {
    provider,
    clientId,
    clientSecret,
    scopes,
  });

  revalidatePath("/master");
  await redirectWithStatus(result.ok ? provider + "-saved" : provider + "-error");
}

export async function masterLogout() {
  await clearMasterSessionCookie();
  redirect("/master-login");
}
