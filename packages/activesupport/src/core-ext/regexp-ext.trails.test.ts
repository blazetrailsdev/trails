import { describe, expect, it } from "vitest";
import { regexpEscape } from "./regexp.js";

describe("regexpEscape", () => {
  it("escapes the characters a JS RegExp gives meaning to", () => {
    expect(regexpEscape("a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o")).toBe(
      "a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o",
    );
  });

  it("matches the literal it was given", () => {
    const literal = "a.b*c[d]";
    expect(new RegExp(`^${regexpEscape(literal)}$`).test(literal)).toBe(true);
    expect(new RegExp(`^${regexpEscape(literal)}$`).test("axbxcxdx")).toBe(false);
  });

  it("leaves -, # and whitespace alone so the result is legal under a u flag", () => {
    expect(regexpEscape("a-b#c d")).toBe("a-b#c d");
    expect(() => new RegExp(regexpEscape("a-b#c d"), "u")).not.toThrow();
    expect(new RegExp(`^${regexpEscape("a-b#c d")}$`, "u").test("a-b#c d")).toBe(true);
  });
});
