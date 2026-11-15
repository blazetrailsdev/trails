import { describe, expect, it } from "vitest";
import { Range } from "../../lib/range.js";
import { sliceBang, strSlice } from "../../lib/string/slice.js";

describe("sliceBang", () => {
  it("slices by character range", () => {
    expect(sliceBang("こにちわ", new Range(1, 2))).toEqual(["にち", "こわ"]);
  });

  it("accepts a regexp that already carries the d flag", () => {
    expect(sliceBang("abc", /b/d)).toEqual(["b", "ac"]);
  });

  it("answers nil out of bounds", () => {
    expect(sliceBang("abc", 5)).toEqual([null, "abc"]);
  });
});

describe("strSlice", () => {
  it("answers String#slice on a string receiver", () => {
    const s = "(abc)";
    expect(strSlice(s, new Range(1, -2))).toBe("abc");
    expect(strSlice(s, 1)).toBe("a");
    expect(strSlice(s, 1, 2)).toBe("ab");
    expect(strSlice(s, /b(c)/, 1)).toBe("c");
    expect(strSlice(s, new Range(9, null))).toBeNull();
    expect(strSlice("()", new Range(1, -2))).toBe("");
    expect(strSlice("héllo", new Range(1, 2))).toBe("él");
    expect(s).toBe("(abc)");
  });

  it("hands a receiver that is not a string to its own slice", () => {
    const receiver = { slice: (...args: unknown[]) => `sliced ${args.length}` };
    expect(strSlice(receiver, new Range(1, -2))).toBe("sliced 1");
  });
});
