import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

describe("FloatType (trails)", () => {
  it("tracks a float attribute change through the model", () => {
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

  it("special strings are case-sensitive — lowercase variants take the to_f arm", () => {
    // float.rb:55-58 matches "Infinity"/"-Infinity"/"NaN" exactly; anything else
    // falls through to `value.to_f`, and "nan".to_f is 0.0.
    const type = new Types.FloatType();
    expect(type.cast("nan")).toBe(0);
    expect(type.cast("infinity")).toBe(0);
    expect(type.cast("INFINITY")).toBe(0);
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
});
