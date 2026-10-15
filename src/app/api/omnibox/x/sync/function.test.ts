import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("retired X messaging Edge Function", () => {
  const source = readFileSync("supabase/functions/omnibox-x-sync/index.ts", "utf8")
    .replace(/^import .*;$/gm, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  it("refuses legacy DM sync, Chat decryption, send and message import", async () => {
    let handler: ((req: Request) => Response) | null = null;
    runInNewContext(js, {
      Request, Response, JSON,
      Deno: { serve: (callback: (req: Request) => Response) => { handler = callback; } },
    });
    expect(handler).not.toBeNull();
    const execute = handler as unknown as (req: Request) => Response;
    for (const mode of ["sync", "chat_read", "chat_send", "chat_import", "chat_key_status"]) {
      const response = execute(new Request("https://test.invalid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      }));
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({ ok: false, error: "x_messaging_disabled" });
    }
  });
});
