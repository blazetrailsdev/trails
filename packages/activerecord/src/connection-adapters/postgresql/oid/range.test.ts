import { describe, expect, it } from "vitest";
import { Range, RangeType } from "./range.js";

const integerSubtype = {
  cast: (value: unknown) => (value == null ? null : Number(value)),
  serialize: (value: unknown) => (value == null ? null : Number(value)),
  deserialize: (value: unknown) => (value == null ? null : Number(value)),
};

describe("PostgreSQL::OID::Range", () => {
  it("can still represent query range values", () => {
    const range = new Range(1, 10, true);

    expect(range.begin).toBe(1);
    expect(range.end).toBe(10);
    expect(range.excludeEnd).toBe(true);
  });

  it("casts PostgreSQL range strings through the subtype", () => {
    const type = new RangeType(integerSubtype, "int4range");
    const range = type.castValue("[1,10)") as Range;

    expect(range.begin).toBe(1);
    expect(range.end).toBe(10);
    expect(range.excludeEnd).toBe(true);
  });

  it("raises for excluded finite starts", () => {
    const type = new RangeType(integerSubtype, "int4range");

    expect(() => type.castValue("(1,10]")).toThrow(/excluding the beginning/);
  });

  it("serializes range bounds through the subtype", () => {
    const type = new RangeType(integerSubtype, "int4range");
    const range = type.serialize(new Range("1", "10", false)) as Range;

    expect(range.begin).toBe(1);
    expect(range.end).toBe(10);
    expect(range.excludeEnd).toBe(false);
  });

  it("serialize returns non-range values unchanged", () => {
    const type = new RangeType(integerSubtype, "int4range");

    expect(type.serialize("not a range")).toBe("not a range");
  });

  it("castValue returns non-string values unchanged", () => {
    const type = new RangeType(integerSubtype, "int4range");
    const value = { begin: 1, end: 10 };

    expect(type.castValue(value)).toBe(value);
  });

  it("keeps numeric infinite bounds when the opposite bound is numeric", () => {
    const type = new RangeType(integerSubtype, "int4range");
    const range = type.castValue("[,10]") as Range;

    expect(range.begin).toBe(-Infinity);
    expect(range.end).toBe(10);
  });

  it("uses subtype infinity values for unbounded ranges", () => {
    const infinityCalls: Array<{ negative?: boolean } | undefined> = [];
    const type = new RangeType(
      {
        ...integerSubtype,
        infinity: (options?: { negative?: boolean }) => {
          infinityCalls.push(options);
          return options?.negative ? -Infinity : Infinity;
        },
      },
      "tsrange",
    );
    const range = type.castValue("[,]") as Range;

    expect(range.begin).toBe(-Infinity);
    expect(range.end).toBe(Infinity);
    expect(infinityCalls).toEqual([{ negative: true }, undefined]);
  });

  it("maps range bounds", () => {
    const type = new RangeType(integerSubtype, "int4range");
    const range = type.map(new Range(1, 10), (value) => Number(value) + 1) as Range;

    expect(range.begin).toBe(2);
    expect(range.end).toBe(11);
  });

  it("forces equality for range values", () => {
    const type = new RangeType(integerSubtype, "int4range");

    expect(type.isForceEquality(new Range(1, 10))).toBe(true);
    expect(type.isForceEquality([1, 10])).toBe(false);
  });
});
