import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";

export type ManualMailSettings = {
  email: string;
  displayName: string;
  username: string;
  password: string;
  imapHost: string;
  smtpHost: string;
  smtpPort: 465 | 587;
};

const HOST_RE = /^(?=.{4,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function normalizeMailSettings(value: unknown): ManualMailSettings {
  if (!value || typeof value !== "object") throw Error("invalid_mail_settings");
  const p = value as Record<string, unknown>;
  const get = (key: string) => typeof p[key] === "string" ? String(p[key]).trim() : "";
  const port = Number(p.smtpPort);
  const result = {
    email: get("email").toLowerCase(), displayName: get("displayName"),
    username: get("username"), password: get("password"),
    imapHost: get("imapHost").toLowerCase().replace(/\.$/, ""),
    smtpHost: get("smtpHost").toLowerCase().replace(/\.$/, ""),
    smtpPort: port as 465 | 587,
  };
  if (!EMAIL_RE.test(result.email) || result.email.length > 254 ||
      !result.displayName || result.displayName.length > 120 ||
      !result.username || result.username.length > 254 ||
      !result.password || result.password.length > 512 ||
      !HOST_RE.test(result.imapHost) || !HOST_RE.test(result.smtpHost) ||
      isIP(result.imapHost) !== 0 || isIP(result.smtpHost) !== 0 ||
      /\.(?:local|internal|localhost|test|invalid|example)$/i.test(result.imapHost) ||
      /\.(?:local|internal|localhost|test|invalid|example)$/i.test(result.smtpHost) ||
      ![465, 587].includes(result.smtpPort)) {
    throw Error("invalid_mail_settings");
  }
  return result;
}

export function isPublicIpv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a,b,c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && (b === 168 || b === 0 || b === 88) ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113 ||
      a === 192 && b === 0 && c === 2) return false;
  return true;
}

/**
 * Pin the publicly resolved IPv4 address. Callers must connect to this
 * address directly and use the original hostname only for TLS SNI/checks,
 * so a second DNS lookup cannot redirect connections to private services.
 */
export async function resolvePublicMailHost(hostname: string): Promise<string> {
  if (!HOST_RE.test(hostname) || isIP(hostname)) throw Error("mail_host_not_allowed");
  const addresses = await resolve4(hostname);
  if (!addresses.length || addresses.some((ip) => !isPublicIpv4(ip))) {
    throw Error("mail_host_not_allowed");
  }
  return addresses[0];
}
