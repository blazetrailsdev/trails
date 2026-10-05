import { describe, expect, it } from "vitest";
import { toS } from "./object.js";
import { rbEqual } from "./rb-equal.js";
import { rbRegEqual, rbRegToS, regexpEscape } from "./regexp.js";

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

describe("rbRegToS", () => {
  it("embeds the options the pattern carries and turns the others off", () => {
    expect(rbRegToS(/ab+c/)).toBe("(?-ims:ab+c)");
    expect(rbRegToS(/ab+c/is)).toBe("(?is-m:ab+c)");
    expect(rbRegToS(/a/ims)).toBe("(?ims:a)");
  });

  it("means the same spliced into a pattern with other options", () => {
    expect(new RegExp(`x${rbRegToS(/^a.b/)}`, "ims").test("x\na\nb")).toBe(false);
    expect(new RegExp(`x${rbRegToS(/A/i)}`).test("xa")).toBe(true);
  });

  it("is what interpolating a Regexp gives", () => {
    expect(toS(/a/i)).toBe("(?i-ms:a)");
  });
});

describe("rbRegEqual", () => {
  it("compares source and options, not identity", () => {
    expect(rbRegEqual(/^/, /^/)).toBe(true);
    expect(rbRegEqual(/^/, /^/m)).toBe(false);
    expect(rbRegEqual(/^/, /$/)).toBe(false);
    expect(rbRegEqual(/^/, "^")).toBe(false);
    expect(rbRegEqual(/a/g, /a/u)).toBe(true);
    expect(rbRegEqual(/a/gi, /a/)).toBe(false);
    expect(rbEqual(/a/, /a/)).toBe(true);
    expect(rbEqual("a", /a/)).toBe(false);
  });
});
