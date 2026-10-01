import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { rbObjInstanceVariables, rbObjIvarGet } from "@blazetrails/ruby-compat";
import { ValueType, IntegerType, FloatType, DecimalType, BigIntegerType } from "../index.js";

describe("ValueType", () => {
  it("type is nil for the unmapped default", () => {
    expect(new ValueType().type()).toBeUndefined();
  });

  describe("precision / scale / limit", () => {
    it("are nil unless initialize is given them", () => {
      const type = new ValueType();
      expect([type.precision, type.scale, type.limit]).toEqual([null, null, null]);
    });

    it("read what initialize was given", () => {
      const type = new ValueType({ precision: 8, limit: 4, scale: 2 });
      expect([type.precision, type.scale, type.limit]).toEqual([8, 2, 4]);
    });

    it("are readers on the class, so a subclass override is not shadowed by the instance", () => {
      class Wrapping extends ValueType {
        override get limit(): number | null {
          return 16;
        }
      }
      const type = new Wrapping({ limit: 4 });
      expect(type.limit).toBe(16);
      expect(Object.keys(type)).not.toContain("limit");
    });

    it("are held in the ivars initialize sets, in its order", () => {
      const type = new ValueType({ precision: 8, limit: 4, scale: 2 });
      expect(rbObjInstanceVariables(type)).toEqual(["@precision", "@scale", "@limit"]);
      expect(rbObjIvarGet(type, "@limit")).toBe(4);
    });
  });

  describe("equals", () => {
    it("same class, no metadata: equal", () => {
      expect(new ValueType().equals(new ValueType())).toBe(true);
    });

    it("different class: not equal", () => {
      expect(new IntegerType().equals(new FloatType())).toBe(false);
    });

    it("same class, same precision and scale: equal", () => {
      expect(
        new DecimalType({ precision: 8, scale: 2 }).equals(
          new DecimalType({ precision: 8, scale: 2 }),
        ),
      ).toBe(true);
    });

    it("same class, different precision: not equal", () => {
      expect(new DecimalType({ precision: 8 }).equals(new DecimalType({ precision: 4 }))).toBe(
        false,
      );
    });

    it("same class, different scale: not equal", () => {
      expect(new DecimalType({ scale: 2 }).equals(new DecimalType({ scale: 4 }))).toBe(false);
    });

    it("same class, different limit: not equal", () => {
      expect(new IntegerType({ limit: 8 }).equals(new IntegerType({ limit: 4 }))).toBe(false);
    });

    it("subclass and parent: not equal", () => {
      expect(new IntegerType().equals(new BigIntegerType())).toBe(false);
    });
  });
});

describe("ValueType#isChanged is Ruby value equality", () => {
  it("compares the object-valued casts that inherit it, and leaves unknown shapes changed", () => {
    const type = new ValueType();

    expect(type.isChanged([1, 2], [1, 2])).toBe(false);
    expect(type.isChanged([1, 2], [1, 3])).toBe(true);
    expect(type.isChanged({ a: 1 }, { a: 1 })).toBe(false);
    expect(type.isChanged({ a: 1 }, { a: 2 })).toBe(true);
    expect(type.isChanged(new Uint8Array([0x80]), new Uint8Array([0x80]))).toBe(false);
    expect(type.isChanged(new Date(0), new Date(0))).toBe(false);
    expect(type.isChanged(new Date(0), new Date(1))).toBe(true);
    expect(type.isChanged("a", "a")).toBe(false);
    expect(type.isChanged(1, 2)).toBe(true);
    expect(type.isChanged(null, null)).toBe(false);
  });

  it("answers changed rather than raising when the two casts are unrelated Temporal shapes", () => {
    const type = new ValueType();
    const date = Temporal.PlainDate.from("2026-09-03");

    expect(type.isChanged(date, Temporal.Instant.fromEpochMilliseconds(0))).toBe(true);
    expect(type.isChanged(date, Temporal.PlainDate.from("2026-09-03"))).toBe(false);
    expect(type.isChanged(date, Temporal.PlainDate.from("2026-09-04"))).toBe(true);
    expect(type.isChanged(date, Temporal.PlainDateTime.from("2026-09-03T00:00"))).toBe(false);
    expect(type.isChanged(date, Temporal.PlainDateTime.from("2026-09-03T01:00"))).toBe(true);
  });
});
