import fs from "node:fs";
import path from "node:path";
import { Linter } from "eslint";

const htmlPath = path.resolve("public/omnibox.html");
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((code) => code.trim());

if (scripts.length === 0) {
  console.error("No inline JavaScript found in public/omnibox.html");
  process.exit(1);
}

const source = scripts.join("\n\n");
const windowAssignedGlobals = [
  ...source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g),
].map((match) => match[1]);

const globals = Object.fromEntries(
  [
    "window","document","console","fetch","URL","URLSearchParams","FormData",
    "setTimeout","clearTimeout","setInterval","clearInterval","structuredClone",
    "navigator","location","crypto","Event","CustomEvent","Image","HTMLElement",
    "Node","localStorage","sessionStorage","alert","confirm","requestAnimationFrame",
    "cancelAnimationFrame","atob","btoa","TextEncoder","TextDecoder","AbortController",
    "lucide","tailwind","__app_id",
    ...windowAssignedGlobals
  ].map((name) => [name, "readonly"]),
);

const linter = new Linter({ configType: "flat" });
const messages = linter.verify(source, [
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals,
    },
    rules: {
      "no-undef": "error",
    },
  },
]);

const errors = messages.filter((message) => message.severity === 2);
if (errors.length > 0) {
  for (const error of errors) {
    console.error(
      `omnibox.html inline JS:${error.line}:${error.column} ${error.message} (${error.ruleId})`,
    );
  }
  process.exit(1);
}

console.log(`Inline JavaScript no-undef check passed (${scripts.length} script block(s)).`);
