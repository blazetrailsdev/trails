import { describe, expect, it } from "vitest";
import { Range } from "@blazetrails/ruby-compat/range";
import "./each.js";

describe("EachTimeWithZone", () => {
  it("passes each's block to super", () => {
    const seen: number[] = [];
    const range = new Range(1, 3);
    expect(range.each((v) => seen.push(v))).toBe(range);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("passes step's block to super", () => {
    const seen: number[] = [];
    const range = new Range(1, 5);
    expect(range.step(2, (v) => seen.push(v))).toBe(range);
    expect(seen).toEqual([1, 3, 5]);
  });
});
