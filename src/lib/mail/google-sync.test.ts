import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Supabase Edge function is deployed separately from Next.js.
// Check its Gmail list filter so a future edit cannot silently exclude
// self-addressed messages (which have both INBOX and SENT Gmail labels).
describe("Gmail inbox synchronization filter", () => {
  const source = readFileSync(
    join(process.cwd(), "supabase/functions/omnibox-google-sync/index.ts"), "utf8",
  );

  it("selects messages delivered to INBOX", () => {
    expect(source).toContain('listUrl.searchParams.set("labelIds", "INBOX")');
  });

  it("does not exclude self-addressed messages sent from the mailbox owner", () => {
    expect(source).not.toMatch(/listUrl\.searchParams\.set\(\s*["']q["']\s*,\s*["']-from:me["']\s*\)/);
  });

  it("still loads full Gmail message payloads for ingestion", () => {
    expect(source).toContain('messageUrl.searchParams.set("format", "full")');
    expect(source).toContain('p_provider: "email"');
  });
});
