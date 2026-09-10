import { describe, expect, it } from "vitest";
import { isIn, presenceIn } from "../../index.js";
import { ArgumentError } from "../../hash-utils.js";
import { Temporal } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat/range";
import { tomorrow } from "../date/calculations.js";

describe("InTest", () => {
  it("in array", () => {
    expect(isIn(1, [1, 2, 3])).toBe(true);
    expect(isIn(4, [1, 2, 3])).toBe(false);
  });

  it("in hash", () => {
    expect(isIn("a", { a: 1, b: 2 })).toBe(true);
    expect(isIn("c", { a: 1, b: 2 })).toBe(false);
  });

  it("in string", () => {
    expect(isIn("ell", "hello")).toBe(true);
    expect(isIn("xyz", "hello")).toBe(false);
  });

  it("in range", () => {
    expect(isIn(25, new Range(1, 50))).toBe(true);
    expect(isIn(75, new Range(1, 50))).toBe(false);
  });

  it("in set", () => {
    const set = new Set([1, 2, 3]);
    expect(isIn(2, set)).toBe(true);
    expect(isIn(4, set)).toBe(false);
  });

  it("in date range", () => {
    expect(isIn(Temporal.Now.plainDateISO(), new Range(null, tomorrow()))).toBe(true);
    expect(isIn(Temporal.Now.plainDateISO(), new Range(tomorrow(), null))).toBe(false);
  });

  it("no method catching", () => {
    expect(() => isIn(1, 1 as never)).toThrow(ArgumentError);
  });

  it("presence in", () => {
    expect(presenceIn(2, [1, 2, 3])).toBe(2);
    expect(presenceIn(4, [1, 2, 3])).toBeNull();
  });
});
