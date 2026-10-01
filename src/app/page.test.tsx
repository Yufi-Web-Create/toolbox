import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the pipeline check content", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("toolbox development environment");
    expect(markup).toContain("APP-001");
    expect(markup).toContain("Next.js pipeline check");
  });
});
