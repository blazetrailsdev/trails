import { describe, it } from "vitest";

import { assert, assertNot } from "../testing/assertions.js";

describe("SymbolStartsEndsWithTest", () => {
  it("starts ends with alias", () => {
    const s = "hello";
    const startsWith = (...prefixes: string[]) => prefixes.some((p) => s.startsWith(p));
    const endsWith = (...suffixes: string[]) => suffixes.some((p) => s.endsWith(p));
    assert(startsWith("h"));
    assert(startsWith("hel"));
    assertNot(startsWith("el"));
    assert(startsWith("he", "lo"));
    assertNot(startsWith("el", "lo"));

    assert(endsWith("o"));
    assert(endsWith("lo"));
    assertNot(endsWith("el"));
    assert(endsWith("he", "lo"));
    assertNot(endsWith("he", "ll"));
  });
});
