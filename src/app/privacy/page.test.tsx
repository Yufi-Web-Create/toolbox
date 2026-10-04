import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/legal";
import PrivacyPage from "./page";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

describe("PrivacyPage", () => {
  it("renders the heading and shared legal placeholders", () => {
    const text = textOf(PrivacyPage());

    expect(text).toContain("プライバシーポリシー");
    expect(text).toContain(OPERATOR_NAME);
    expect(text).toContain(CONTACT_EMAIL);
  });
});
