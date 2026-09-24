import { describe, expect, it } from "vitest";
import { isIn, presenceIn } from "../../index.js";
import { ArgumentError } from "../../hash-utils.js";
import { Temporal } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat/range";
import { tomorrow } from "../date/calculations.js";
import { assertNil } from "../../testing/assertions.js";

describe("InTest", () => {
  it("in array", () => {
    expect(isIn(1, [1, 2])).toBeTruthy();
    expect(isIn(3, [1, 2])).toBeFalsy();
  });

  it("in hash", () => {
    const h = { a: 100, b: 200 };
    expect(isIn("a", h)).toBeTruthy();
    expect(isIn("z", h)).toBeFalsy();
  });

  it("in string", () => {
    expect(isIn("lo", "hello")).toBeTruthy();
    expect(isIn("ol", "hello")).toBeFalsy();
    expect(isIn("h", "hello")).toBeTruthy();
  });

  it("in range", () => {
    expect(isIn(25, new Range(1, 50))).toBeTruthy();
    expect(isIn(75, new Range(1, 50))).toBeFalsy();
  });

  it("in set", () => {
    const s = new Set([1, 2]);
    expect(isIn(1, s)).toBeTruthy();
    expect(isIn(3, s)).toBeFalsy();
  });

  it("in date range", () => {
    expect(isIn(Temporal.Now.plainDateISO(), new Range(null, tomorrow()))).toBeTruthy();
    expect(isIn(Temporal.Now.plainDateISO(), new Range(tomorrow(), null))).toBeFalsy();
  });

  it("no method catching", () => {
    expect(() => isIn(1, 1 as never)).toThrow(ArgumentError);
  });

  it("presence in", () => {
    expect(presenceIn("stuff", ["lots", "of", "stuff"])).toEqual("stuff");
    assertNil(presenceIn("stuff", ["lots", "of", "crap"]));
    expect(() => presenceIn(1, 1 as never)).toThrow(ArgumentError);
  });
});
