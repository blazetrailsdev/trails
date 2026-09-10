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

describe("OID::LegacyPoint mutable helper", () => {
  const type = new LegacyPoint();

  it("reports itself as mutable", () => {
    expect(type.isMutable()).toBe(true);
  });

  it("detects an in-place mutation of the array", () => {
    const value = type.cast("(1,2)") as number[];
    const rawOldValue = type.serialize(value);
    value[0] = 3;
    expect(type.isChangedInPlace(rawOldValue, value)).toBe(true);
  });

  it("reports no change in place for a member-equal point", () => {
    expect(type.isChangedInPlace("(1,2)", [1.0, 2.0])).toBe(false);
  });
});
