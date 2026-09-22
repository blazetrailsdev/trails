import { describe, expect, it } from "vitest";
import { Range } from "../range.js";
import { sliceBang } from "./slice.js";

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
