import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the wallet modal layout bug.
 *
 * The near-wallet-selector modal mounts on document.body, outside #root.
 * Unscoped app CSS leaks into it: the unscoped .sidebar rule (height:
 * calc(100vh - 2.35rem)) made every wallet row ~862px tall and pushed the
 * wallet buttons out of view. These tests keep app styles scoped to #root
 * so the modal rows cannot be stretched again.
 */

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function rules(source: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    out.push({
      selector: match[1].trim().replace(/\s+/g, " "),
      body: match[2],
    });
  }
  return out;
}

const allRules = rules(css);

function unscoped(selector: string): boolean {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => !part.startsWith("#root"));
}

describe("styles.css scoping (wallet modal leak guard)", () => {
  it("scopes every .sidebar selector under #root", () => {
    const offenders = allRules
      .filter((rule) => /\.sidebar\b/.test(rule.selector) && unscoped(rule.selector))
      .map((rule) => rule.selector);
    expect(offenders).toEqual([]);
  });

  it("scopes every viewport-height rule under #root", () => {
    const hasViewportHeight = (body: string) =>
      body
        .split(";")
        .map((decl) => decl.trim())
        .filter(Boolean)
        .some((decl) => {
          const [prop, value = ""] = decl.split(":");
          return prop.trim() === "height" && /calc\(\s*100vh/.test(value);
        });
    const offenders = allRules
      .filter((rule) => hasViewportHeight(rule.body))
      .filter((rule) => unscoped(rule.selector))
      .map((rule) => rule.selector);
    expect(offenders).toEqual([]);
  });
});
