/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { include } from "@blazetrails/activesupport";
import { Dirty } from "../dirty.js";
import { describe, it, expect } from "vitest";
import { cmp, rbEql, rbEqual, rbObjAsString, rbObjClass } from "@blazetrails/ruby-compat";
import { Model, Types } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("FloatType (trails)", () => {
  it("tracks a float attribute change through the model", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        include(this, Dirty);
        this.attribute("value", "float");
      }
    }
    interface MyModel extends Attributes, Dirty {}
    const m = new MyModel({ value: 1.5 });
    m._writeAttribute("value", 2.5);
    expect(m._readAttribute("value")).toBe(2.5);
    expect(m.attributeChanged("value")).toBe(true);
  });

  it("cast passes numbers through and parses decimal strings", () => {
    const type = new Types.FloatType();
    expect(type.cast(42.5)).toBe(42.5);
    expect(type.cast("3.14")).toBe(3.14);
    expect(type.cast(null)).toBe(null);
  });

  it("blank string casts to null via Helpers::Numeric", () => {
    const type = new Types.FloatType();
    expect(type.cast("")).toBeNull();
    expect(type.cast("   ")).toBeNull();
  });

  it("serialize delegates to cast via Helpers::Numeric", () => {
    const type = new Types.FloatType();
    expect(type.serialize("3.14")).toBe(3.14);
  });

  it('isChanged returns true for NaN-to-NaN when raw is a "NaN" string — equal_nan? takes value_before_type_cast', () => {
    const type = new Types.FloatType();
    expect(type.isChanged(NaN, NaN, "NaN")).toBe(true);
  });

  it("isChanged returns true for a genuine float change", () => {
    const type = new Types.FloatType();
    expect(type.isChanged(1.0, 2.0, "2.0")).toBe(true);
  });

  it("casting booleans via Helpers::Numeric — true → 1.0, false → 0.0", () => {
    const type = new Types.FloatType();
    expect(type.cast(true)).toEqual(new Number(1.0));
    expect(type.cast(false)).toEqual(new Number(0.0));
  });

  it('cast "NaN" returns Number.NaN', () => {
    const type = new Types.FloatType();
    expect(Number.isNaN(type.cast("NaN"))).toBe(true);
  });

  it('cast "Infinity" returns Number.POSITIVE_INFINITY', () => {
    const type = new Types.FloatType();
    expect(type.cast("Infinity")).toBe(Number.POSITIVE_INFINITY);
  });

  it('cast "-Infinity" returns Number.NEGATIVE_INFINITY', () => {
    const type = new Types.FloatType();
    expect(type.cast("-Infinity")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("special strings are case-sensitive — lowercase variants take the to_f arm", () => {
    const type = new Types.FloatType();
    expect(type.cast("nan")).toEqual(new Number(0.0));
    expect(type.cast("infinity")).toEqual(new Number(0.0));
    expect(type.cast("INFINITY")).toEqual(new Number(0.0));
  });

  it('serialize("NaN") round-trips to Number.NaN via Helpers::Numeric', () => {
    const type = new Types.FloatType();
    expect(Number.isNaN(type.serialize("NaN"))).toBe(true);
  });

  it("typeCastForSchema dumps the float specials as Ruby constants", () => {
    const type = new Types.FloatType();
    expect(type.typeCastForSchema(NaN)).toBe("::Float::NAN");
    expect(type.typeCastForSchema(Infinity)).toBe("::Float::INFINITY");
    expect(type.typeCastForSchema(-Infinity)).toBe("-::Float::INFINITY");
  });

  it("a whole-valued float attribute interpolates as a Float", () => {
    class MyModel extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("value", "float");
      }
    }
    const read = (attrs: Record<string, unknown>) =>
      (new MyModel(attrs) as unknown as Attributes)._readAttribute("value");
    const value = read({ value: "1" });
    expect(rbObjClass(value)).toBe("Float");
    expect(rbObjAsString(value)).toBe("1.0");
    expect(rbObjAsString(read({ value: 2 }))).toBe("2.0");
  });

  it("a whole-valued float still does arithmetic and compares by value", () => {
    const type = new Types.FloatType();
    const value = type.cast("1") as number;
    expect(value + 1).toBe(2);
    expect(value * 2.5).toBe(2.5);
    expect(value < 2).toBe(true);
    expect(cmp(value, 1)).toBe(0);
    expect(rbEqual(value, 1)).toBe(true);
    expect(rbEqual(value, type.cast(1.0))).toBe(true);
    expect(rbEql(value, 1)).toBe(false);
    expect(rbEql(value, type.cast(1.0))).toBe(true);
    expect(type.isChanged(value, type.cast("1.0"), "1.0")).toBe(false);
  });
});
