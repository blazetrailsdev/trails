import { describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";

describe("PG::TextDecoder bodies", () => {
  it("Integer decodes past Number.MAX_SAFE_INTEGER as a bigint", () => {
    const dec = new PG.TextDecoder.Integer();
    expect(dec.decode("123")).toBe(123);
    expect(dec.decode("-123")).toBe(-123);
    expect(dec.decode("-0")).toBe(0);
    expect(dec.decode("9007199254740993")).toBe(9007199254740993n);
    expect(dec.decode("-9223372036854775808")).toBe(-9223372036854775808n);
  });

  it("Integer falls back to rb_cstr2inum's lenient parse", () => {
    const dec = new PG.TextDecoder.Integer();
    expect(dec.decode(" 42")).toBe(42);
    expect(dec.decode("abc")).toBe(0);
  });

  it("Float decodes NaN and the infinities", () => {
    const dec = new PG.TextDecoder.Float();
    expect(dec.decode("NaN")).toBeNaN();
    expect(dec.decode("Infinity")).toBe(Infinity);
    expect(dec.decode("-Infinity")).toBe(-Infinity);
    expect(dec.decode("-1.5")).toBe(-1.5);
  });

  it("Timestamp passes infinity and -infinity through as strings", () => {
    const dec = new PG.TextDecoder.TimestampUtc();
    expect(dec.decode("infinity")).toBe("infinity");
    expect(dec.decode("-infinity")).toBe("-infinity");
    expect(dec.decode("2016-01-02 23:23:59x")).toBe("2016-01-02 23:23:59x");
  });

  it("Timestamp decodes fractions and offsets field by field", () => {
    const dec = new PG.TextDecoder.TimestampWithTimeZone();
    const t = dec.decode("2016-01-02 23:23:59.123456789-04:30") as {
      utcOffset: number;
      nsec: number;
    };
    expect(t.utcOffset).toBe(-(4 * 3600 + 30 * 60));
    expect(t.nsec).toBe(123456789);
  });
});
