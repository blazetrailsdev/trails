import { describe, it } from "vitest";

import { assert, assertNot } from "../testing/assertions.js";
import { endsWith, startsWith } from "./string/starts-ends-with.js";

describe("SymbolStartsEndsWithTest", () => {
  it("starts ends with alias", () => {
    const s = "hello";
    assert(startsWith(s, "h"));
    assert(startsWith(s, "hel"));
    assertNot(startsWith(s, "el"));
    assert(startsWith(s, "he", "lo"));
    assertNot(startsWith(s, "el", "lo"));

    assert(endsWith(s, "o"));
    assert(endsWith(s, "lo"));
    assertNot(endsWith(s, "el"));
    assert(endsWith(s, "he", "lo"));
    assertNot(endsWith(s, "he", "ll"));
  });
});
