import { describe, expect, it } from "vitest";
import { Bit, Data as BitData } from "./bit.js";
import { Hstore } from "./hstore.js";
import { Interval } from "./interval.js";
import { Macaddr } from "./macaddr.js";
import { Money } from "./money.js";
import { Xml } from "./xml.js";

describe("PostgreSQL OID types take Rails' control flow", () => {
  it("Bit#cast_value sends to_s to a non-String and reads hex as String#hex does", () => {
    const type = new Bit();
    expect(type.castValue(12)).toBe("12");
    expect(type.castValue("0xzz")).toBe("0");
  });

  it("Bit#serialize and Xml#serialize wrap super for any truthy value", () => {
    expect(new Bit().serialize(false)).toBeNull();
    expect(new Bit().serialize(new BitData("01"))!.toString()).toBeInstanceOf(BitData);
    expect(new Xml().serialize(false)).toBeNull();
    expect(String(new Xml().serialize(12))).toBe("12");
  });

  it("Money#cast_value answers a non-String unchanged", () => {
    const type = new Money() as unknown as { castValue(value: unknown): unknown };
    expect(type.castValue(12.5)).toBe(12.5);
  });

  it("Interval falls through to super for anything but a Duration, String or Numeric", () => {
    const type = new Interval();
    expect(type.castValue(3600)).toBe(3600);
    expect(type.serialize("P1D")).toBe("P1D");
    expect(type.serialize(true)).toBe(true);
    expect(type.typeCastForSchema(null)).toBe("nil");
    expect(type.typeCastForSchema('a"b')).toBe('"a\\"b"');
  });

  it("Macaddr#changed? compares classes, then casecmp", () => {
    const type = new Macaddr();
    expect(type.isChanged("AA:BB", "aa:bb")).toBe(false);
    expect(type.isChanged("aa:bb", null)).toBe(true);
    expect(type.isChanged(null, null)).toBe(false);
    expect(type.isChangedInPlace("aa:bb", "aa:cc")).toBe(true);
  });

  it("Hstore#serialize sends to_unsafe_h and answers anything else unchanged", () => {
    class Parameters {
      toUnsafeH(): Record<string, string> {
        return { a: "1" };
      }
    }
    const type = new Hstore();
    expect(type.serialize(new Parameters())).toBe('"a"=>"1"');
    expect(type.serialize(12)).toBe(12);
    expect(type.isChangedInPlace('"a"=>"1", "b"=>NULL', { b: null, a: "1" })).toBe(false);
  });
});
