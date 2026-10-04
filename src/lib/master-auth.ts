import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const MASTER_COOKIE = "omnibox_master_session";
const MASTER_SESSION_SECONDS = 8 * 60 * 60;

function masterPassword() {
  return process.env.OMNIBOX_MASTER_PASSWORD?.trim() ?? "";
}

function equalText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signExpiry(expiresAt: string, password: string) {
  return createHmac("sha256", password)
    .update("omnibox-master-session." + expiresAt)
    .digest("base64url");
}

export function isMasterConfigured() {
  return masterPassword().length >= 8;
}

export function verifyMasterPassword(candidate: string) {
  const configured = masterPassword();
  return configured.length >= 8 && equalText(candidate, configured);
}

export function createMasterSessionValue(now = Date.now()) {
  const password = masterPassword();
  if (password.length < 8) return "";

  const expiresAt = String(Math.floor(now / 1000) + MASTER_SESSION_SECONDS);
  return expiresAt + "." + signExpiry(expiresAt, password);
}

export function verifyMasterSessionValue(
  value: string | undefined,
  now = Date.now(),
) {
  if (!value) return false;
  const password = masterPassword();
  if (password.length < 8) return false;

  const parts = value.split(".");
  if (parts.length !== 2) return false;

  const [expiresAt, signature] = parts;
  const expires = Number.parseInt(expiresAt, 10);
  if (!Number.isFinite(expires) || expires <= Math.floor(now / 1000)) {
    return false;
  }

  return equalText(signature, signExpiry(expiresAt, password));
}

export async function hasMasterSession() {
  const store = await cookies();
  return verifyMasterSessionValue(store.get(MASTER_COOKIE)?.value);
}

export async function setMasterSessionCookie() {
  const value = createMasterSessionValue();
  if (!value) throw new Error("master_not_configured");

  const store = await cookies();
  store.set(MASTER_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MASTER_SESSION_SECONDS,
  });
}

export async function clearMasterSessionCookie() {
  const store = await cookies();
  store.set(MASTER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
