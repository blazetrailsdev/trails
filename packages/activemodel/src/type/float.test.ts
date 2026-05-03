import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

describe("FloatTest", () => {
  it("changing float", () => {
    class MyModel extends Model {
      static {
        this.attribute("value", "float");
      }
    }
    const m = new MyModel({ value: 1.5 });
    m.writeAttribute("value", 2.5);
    expect(m.readAttribute("value")).toBe(2.5);
    expect(m.attributeChanged("value")).toBe(true);
  });

  it("type cast float", () => {
    const type = new Types.FloatType();
    expect(type.cast(42.5)).toBe(42.5);
    expect(type.cast("3.14")).toBe(3.14);
    expect(type.cast(null)).toBe(null);
  });

  it("type cast float from invalid string", () => {
    const type = new Types.FloatType();
    expect(type.cast("not-a-number")).toBe(null);
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

  it("isChanged returns false for two NaN values", () => {
    const type = new Types.FloatType();
    expect(type.isChanged(NaN, NaN, NaN)).toBe(false);
  });

  it("casting booleans via Helpers::Numeric — true → 1.0, false → 0.0", () => {
    const type = new Types.FloatType();
    expect(type.cast(true)).toBe(1);
    expect(type.cast(false)).toBe(0);
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

  it("special strings are case-sensitive — lowercase variants cast to null", () => {
    const type = new Types.FloatType();
    expect(type.cast("nan")).toBeNull();
    expect(type.cast("infinity")).toBeNull();
    expect(type.cast("INFINITY")).toBeNull();
  });

  it('serialize("NaN") round-trips to Number.NaN via Helpers::Numeric', () => {
    const type = new Types.FloatType();
    expect(Number.isNaN(type.serialize("NaN"))).toBe(true);
  });

  it("typeCastForSchema(NaN) still returns '\"NaN\"'", () => {
    const type = new Types.FloatType();
    expect(type.typeCastForSchema(NaN)).toBe('"NaN"');
  });
});
