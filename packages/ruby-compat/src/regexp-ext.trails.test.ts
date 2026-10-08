import { describe, expect, it } from "vitest";
import { toS } from "./object.js";
import { rbEqual } from "./rb-equal.js";
import {
  rbRegEqual,
  rbRegInitStr,
  rbRegMatchP,
  rbRegSUnion,
  rbRegToS,
  regexpEscape,
} from "./regexp.js";

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

describe("Regexp MRI option spelling (trails)", () => {
  it("to_s spells MRI's option letters under the onig syntax", () => {
    expect(rbRegToS(/ab+c/, "onig")).toBe("(?-mix:ab+c)");
    expect(rbRegToS(/.*/s, "onig")).toBe("(?m-ix:.*)");
    expect(rbRegToS(/a/is, "onig")).toBe("(?mi-x:a)");
    expect(rbRegToS(/^a/m, "onig")).toBe("(?-mix:^a)");
    expect(rbRegToS(/a/dgimsuy, "onig")).toBe("(?mi-x:a)");
    expect(rbRegToS(new RegExp("a", "v"), "onig")).toBe("(?-mix:a)");
  });

  it("Regexp.new reads MRI's to_s back", () => {
    for (const re of [/ab+c/, /.*/s, /a/is, /a(b|c)\)/i]) {
      const loaded = rbRegInitStr(rbRegToS(re, "onig"));
      expect([loaded.source, loaded.flags]).toEqual([re.source, re.flags]);
    }
    for (const pattern of ["(?m:a)(b)", "(?i:a)|(?i:b)", "(?i:a)(?-i:b)", "(?i:a)[)]"]) {
      const loaded = rbRegInitStr(pattern);
      expect([loaded.source, loaded.flags]).toEqual([pattern, ""]);
    }
    const classed = rbRegInitStr("(?i-mx:[)(]\\))");
    expect([classed.source, classed.flags]).toEqual(["[)(]\\)", "i"]);
    const bare = rbRegInitStr("(?-mix:a)");
    expect([bare.source, bare.flags]).toEqual(["a", ""]);
    expect(rbRegInitStr("a+").source).toBe("a+");
    expect(() => rbRegInitStr("(?x: a )")).toThrow(SyntaxError);
  });
});

describe("rbRegMatchP", () => {
  it("answers whether the pattern matches", () => {
    expect(rbRegMatchP(/b/, "abc")).toBe(true);
    expect(rbRegMatchP(/x/, "abc")).toBe(false);
  });

  it("is false for nil", () => {
    expect(rbRegMatchP(/.*/, null)).toBe(false);
  });

  it("answers the same on every call for a g-flagged pattern", () => {
    const re = /^ignored_/g;
    expect(rbRegMatchP(re, "ignored_fk")).toBe(true);
    expect(rbRegMatchP(re, "ignored_fk")).toBe(true);
    expect(re.lastIndex).toBe(0);
  });

  it("answers the same on every call for a y-flagged pattern", () => {
    const re = /ignored_/y;
    expect(rbRegMatchP(re, "ignored_fk")).toBe(true);
    expect(rbRegMatchP(re, "ignored_fk")).toBe(true);
    expect(re.lastIndex).toBe(0);
  });

  it("leaves a lastIndex the caller set where it was", () => {
    const re = /a/g;
    re.lastIndex = 2;
    expect(rbRegMatchP(re, "abc")).toBe(true);
    expect(re.lastIndex).toBe(2);
  });
});

describe("rbRegSUnion", () => {
  it("escapes and joins Strings", () => {
    expect(rbRegSUnion("a.b").source).toBe("a\\.b");
    expect(rbRegSUnion("skiing", "sledding").source).toBe("skiing|sledding");
    expect(rbRegSUnion(["id", "na|me"]).source).toBe("id|na\\|me");
    expect(rbRegSUnion(["id", "na|me"]).test("na|me")).toBe(true);
    expect(rbRegSUnion(["id", "na|me"]).test("me")).toBe(false);
  });

  it("returns a lone Regexp itself", () => {
    const re = /c/i;
    expect(rbRegSUnion(re)).toBe(re);
    expect(rbRegSUnion([re])).toBe(re);
  });

  it("embeds each Regexp with its own options", () => {
    const re = rbRegSUnion(/a/i, /b/);
    expect(re.source).toBe("(?i-ms:a)|(?-ims:b)");
    expect(re.flags).toBe("");
    expect(re.test("A")).toBe(true);
    expect(re.test("B")).toBe(false);
  });

  it("mixes Strings and Regexps", () => {
    const re = rbRegSUnion("a.b", /c/i, /d/s);
    expect(re.source).toBe("a\\.b|(?i-ms:c)|(?s-im:d)");
    expect(re.test("a.b")).toBe(true);
    expect(re.test("axb")).toBe(false);
    expect(re.test("C")).toBe(true);
  });

  it("is /(?!)/ for no patterns", () => {
    expect(rbRegSUnion().source).toBe("(?!)");
    expect(rbRegSUnion([]).source).toBe("(?!)");
    expect(rbRegSUnion().test("")).toBe(false);
  });
});
