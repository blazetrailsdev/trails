import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Range, RangeType, MultiRange, MultiRangeType } from "./range.js";

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

  describe("typeCastForSchema / inspect()", () => {
    const passthroughSubtype = {
      cast: (v: unknown) => v,
      serialize: (v: unknown) => v,
      deserialize: (v: unknown) => v,
    };

    it("formats a value as a string via String()", () => {
      const type = new RangeType(passthroughSubtype, "int4range");
      // inspect() falls through to String(value) for non-primitive, non-Temporal objects.
      expect(typeof type.typeCastForSchema(new Range(1, 10))).toBe("string");
    });

    it("formats a Temporal.Instant value via inspect()", () => {
      const type = new RangeType(passthroughSubtype, "tstzrange");
      const instant = Temporal.Instant.from("2026-04-28T00:00:00Z");
      // inspect() is called with the Instant directly when passed as the
      // top-level value to typeCastForSchema.
      expect(type.typeCastForSchema(instant)).toContain("2026-04-28");
    });

    it("throws on Date passed directly to typeCastForSchema / inspect()", () => {
      const type = new RangeType(passthroughSubtype, "tsrange");
      // inspect() receives the Date directly here (not as a Range bound),
      // exercising the Date guard added in this PR.
      expect(() => type.typeCastForSchema(new Date())).toThrow(TypeError);
      expect(() => type.typeCastForSchema(new Date())).toThrow(/Temporal/);
    });
  });
});

describe("PostgreSQL::OID::MultiRange", () => {
  const type = new MultiRangeType(integerSubtype, "int4multirange");

  it("deserializes a two-element multirange literal", () => {
    const result = type.deserialize("{[1,5),[10,20)}") as MultiRange;
    expect(result).toBeInstanceOf(MultiRange);
    expect(result.ranges).toHaveLength(2);
    expect(result.ranges[0].begin).toBe(1);
    expect(result.ranges[0].end).toBe(5);
    expect(result.ranges[0].excludeEnd).toBe(true);
    expect(result.ranges[1].begin).toBe(10);
    expect(result.ranges[1].end).toBe(20);
  });

  it("returns empty MultiRange for empty literal {}", () => {
    const result = type.deserialize("{}") as MultiRange;
    expect(result).toBeInstanceOf(MultiRange);
    expect(result.ranges).toHaveLength(0);
  });

  it("returns null for null", () => {
    expect(type.deserialize(null)).toBeNull();
  });

  it("serializes a MultiRange back to PG literal", () => {
    const mr = new MultiRange([new Range(1, 5, true), new Range(10, 20, false)]);
    const result = type.serialize(mr) as string;
    expect(result).toMatch(/^\{/);
    expect(result).toContain("1");
    expect(result).toContain("5");
  });

  it("serialize returns non-MultiRange values unchanged", () => {
    expect(type.serialize("not a multirange")).toBe("not a multirange");
  });

  it("handles quoted bounds with ] inside", () => {
    const stringSubtype = {
      cast: (v: unknown) => String(v ?? ""),
      serialize: (v: unknown) => String(v ?? ""),
      deserialize: (v: unknown) => String(v ?? ""),
    };
    const strType = new MultiRangeType(stringSubtype, "stringmultirange");
    // PG-style quoted bound: "[foo]bar" is a valid bound value for a string range.
    // The quote-aware scanner must not stop at the ] inside the quoted bound.
    const result = strType.deserialize('{["[foo]bar","baz")}') as MultiRange;
    expect(result).toBeInstanceOf(MultiRange);
    expect(result.ranges).toHaveLength(1);
    expect(result.ranges[0].begin).toBe("[foo]bar");
    expect(result.ranges[0].end).toBe("baz");
    expect(result.ranges[0].excludeEnd).toBe(true);
  });
});
