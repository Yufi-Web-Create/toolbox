import { describe, expect, it, vi } from "vitest";

import Home from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("Home", () => {
  it("routes visitors to the uploaded OmniBox application shell", () => {
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });

    expect(() => Home()).toThrow("redirect:/omnibox.html");
    expect(mocks.redirect).toHaveBeenCalledWith("/omnibox.html");
  });
});
