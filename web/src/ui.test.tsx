import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoadError } from "./ui";

describe("LoadError", () => {
  it("shows a plain message and a Try again button that re-runs the request", () => {
    let retried = 0;
    const html = renderToStaticMarkup(
      <LoadError message="We could not reach the NEAR testnet. Check your connection and try again." onRetry={() => { retried += 1; }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("We could not reach the NEAR testnet.");
    expect(html).toContain("Try again");
    // The button exists as a real control, not just text.
    expect(html).toContain("<button");
    expect(retried).toBe(0);
  });
});
