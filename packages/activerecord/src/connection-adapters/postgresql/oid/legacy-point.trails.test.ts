import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { LegacyPoint } from "./legacy-point.js";

describe("OID::LegacyPoint#cast", () => {
  const type = new LegacyPoint();

  it("casts a parenthesized string to a pair of floats", () => {
    expect(type.cast("(1,2)")).toEqual([1.0, 2.0]);
    expect(type.cast("1,2")).toEqual([1.0, 2.0]);
  });

  it("raises on an unparseable coordinate, as Kernel#Float does", () => {
    expect(() => type.cast("(x,2)")).toThrow(ArgumentError);
    expect(() => type.cast("")).toThrow(ArgumentError);
  });

  it("returns anything else unchanged", () => {
    expect(type.cast(null)).toBeNull();
    expect(type.cast(5)).toBe(5);
  });
});
