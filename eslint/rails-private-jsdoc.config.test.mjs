import { describe, it, expect } from "vitest";
import standalone from "./rails-private-jsdoc.config.mjs";
import root from "../eslint.config.mjs";

/**
 * The standalone config duplicates the root config's `files` list so the
 * `rails-comparison` CI step can run the two manifest-backed rules alone. Drift
 * between the two would silently drop a package from that step — the exact
 * class of silent under-enforcement this config exists to close.
 */
describe("rails-private-jsdoc.config.mjs", () => {
  const RULES = ["blazetrails/rails-private-jsdoc", "blazetrails/unbacked-internal-needs-receipt"];
  const rootBlockFor = (rule) => root.find((block) => block.rules?.[rule] !== undefined);
  const standaloneBlockFor = (rule) =>
    standalone.find((block) => block.rules?.[rule] !== undefined);

  it("enables only the two manifest-backed rules", () => {
    const enabled = standalone.flatMap((block) => Object.keys(block.rules ?? {}));
    expect(enabled).toEqual(RULES);
    for (const rule of RULES) expect(standaloneBlockFor(rule).rules[rule]).toBe("error");
  });

  it("registers both rules under one plugin block", () => {
    // ESLint refuses to redefine a plugin, so exactly one block may declare it.
    const withPlugins = standalone.filter((block) => block.plugins !== undefined);
    expect(withPlugins).toHaveLength(1);
    expect(Object.keys(withPlugins[0].plugins.blazetrails.rules)).toEqual(
      RULES.map((r) => r.replace("blazetrails/", "")),
    );
  });

  it("matches the root config's file list", () => {
    for (const rule of RULES) {
      expect(rootBlockFor(rule)).toBeDefined();
      expect(standaloneBlockFor(rule).files).toEqual(rootBlockFor(rule).files);
    }
  });

  it("matches the root config's ignores", () => {
    for (const rule of RULES) {
      expect(standaloneBlockFor(rule).ignores).toEqual(rootBlockFor(rule).ignores);
    }
  });
});
