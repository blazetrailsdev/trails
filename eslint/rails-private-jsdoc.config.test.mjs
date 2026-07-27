import { describe, it, expect } from "vitest";
import standalone from "./rails-private-jsdoc.config.mjs";
import root from "../eslint.config.mjs";

/**
 * The standalone config duplicates the root config's `files` list so the
 * `rails-comparison` CI step can run the rule alone. Drift between the two
 * would silently drop a package from that step — the exact class of silent
 * under-enforcement this config exists to close.
 */
describe("rails-private-jsdoc.config.mjs", () => {
  const rootBlock = root.find(
    (block) => block.rules?.["blazetrails/rails-private-jsdoc"] !== undefined,
  );

  it("enables only blazetrails/rails-private-jsdoc", () => {
    expect(standalone).toHaveLength(1);
    expect(Object.keys(standalone[0].rules)).toEqual(["blazetrails/rails-private-jsdoc"]);
    expect(standalone[0].rules["blazetrails/rails-private-jsdoc"]).toBe("error");
  });

  it("matches the root config's file list", () => {
    expect(rootBlock).toBeDefined();
    expect(standalone[0].files).toEqual(rootBlock.files);
  });

  it("matches the root config's ignores", () => {
    expect(standalone[0].ignores).toEqual(rootBlock.ignores);
  });
});
