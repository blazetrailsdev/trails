import { describe, expect, it } from "vitest";
import { lintFileText, listSourceFiles, main } from "./lint-missing-rails-call-reasons.js";

describe("lintFileText", () => {
  it("accepts a tag that carries a reason", () => {
    const text = [
      "/**",
      " * @missingRailsCall save! — validations are enforced by the caller.",
      " */",
      "function f() {}",
    ].join("\n");
    expect(lintFileText("a.ts", text)).toEqual([]);
  });

  it("rejects a bare tag with a file:line and the parser's message shape", () => {
    const text = ["", "/**", " * @missingRailsCall save!", " */", "function f() {}"].join("\n");
    expect(lintFileText("packages/x/src/a.ts", text)).toEqual([
      "@missingRailsCall needs a reason: packages/x/src/a.ts:3 — state why the " +
        "Rails call `save!` is not made here.",
    ]);
  });

  it("rejects a whitespace-only reason", () => {
    const text = ["/**", " * @missingRailsCall save! —   ", " */"].join("\n");
    expect(lintFileText("a.ts", text)).toHaveLength(1);
  });

  it("reports every offending comment in a file, not just the first", () => {
    const text = [
      "/**",
      " * @missingRailsCall save!",
      " */",
      "function f() {}",
      "/**",
      " * @missingRailsCall touch",
      " */",
      "function g() {}",
    ].join("\n");
    expect(lintFileText("a.ts", text)).toHaveLength(2);
  });

  it("ignores files and comments without the tag", () => {
    expect(lintFileText("a.ts", "/** plain prose */\nfunction f() {}")).toEqual([]);
  });
});

describe("listSourceFiles", () => {
  it("returns nothing for a directory that does not exist", async () => {
    expect(await listSourceFiles("/nonexistent-packages-dir")).toEqual([]);
  });
});

describe("main", () => {
  it("passes over the committed tree", async () => {
    expect(await main()).toBe(0);
  });
});
