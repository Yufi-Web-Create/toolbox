"use server";

import { revalidatePath } from "next/cache";
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

function masterUrl(status: string) {
  return "/master?status=" + encodeURIComponent(status);
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

export async function configureLineFromMaster(formData: FormData) {
  await requireMaster();

  const channelId = String(formData.get("channelId") ?? "").trim();
  const channelSecret = String(formData.get("channelSecret") ?? "").trim();

  if (!/^\d+$/.test(channelId) || channelSecret.length < 16) {
    redirect(masterUrl("line-invalid"));
  }

  const result = await operatorBridgeRequest("/internal/operator/line/configure", {
    channelId,
    channelSecret,
  });

  revalidatePath("/master");
  redirect(masterUrl(result.ok ? "line-saved" : "line-error"));
}

export async function repairLineFromMaster() {
  await requireMaster();

  const result = await operatorBridgeRequest("/internal/operator/line/repair", {});
  revalidatePath("/master");
  redirect(masterUrl(result.ok ? "line-repaired" : "line-error"));
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
    redirect(masterUrl("provider-invalid"));
  }

  const result = await operatorBridgeRequest("/internal/operator/provider/configure", {
    provider,
    clientId,
    clientSecret,
    scopes,
  });

  revalidatePath("/master");
  redirect(masterUrl(result.ok ? provider + "-saved" : provider + "-error"));
}

export async function masterLogout() {
  await clearMasterSessionCookie();
  redirect("/master-login");
}
