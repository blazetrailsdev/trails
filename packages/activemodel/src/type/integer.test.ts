import { describe, it, expect } from "vitest";
import { minutes, hours } from "@blazetrails/activesupport";
import { Types } from "../index.js";
import { IntegerType as Integer } from "./integer.js";
import { RangeError } from "../errors.js";
import { Range } from "@blazetrails/ruby-compat";

describe("IntegerTest", () => {
  it("simple values", () => {
    const type = new Types.IntegerType();
    expect(type.cast("")).toBeNull();
    expect(type.cast(1)).toBe(1);
    expect(type.cast("1")).toBe(1);
    expect(type.cast("1ignore")).toBe(1);
    expect(type.cast("bad1")).toBe(0);
    expect(type.cast("bad")).toBe(0);
    expect(type.cast(1.7)).toBe(1);
    expect(type.cast(false)).toBe(0);
    expect(type.cast(true)).toBe(1);
    expect(type.cast(null)).toBeNull();
  });

  it("random objects cast to nil", () => {
    const type = new Types.IntegerType();
    expect(type.cast([1, 2])).toBeNull();
    expect(type.cast({ 1: 2 })).toBeNull();
    expect(type.cast(new Range(1, 2))).toBeNull();
  });

  it("casting objects without to_i", () => {
    const type = new Types.IntegerType();
    expect(type.cast(new Object())).toBeNull();
  });

  it("casting nan and infinity", () => {
    const type = new Types.IntegerType();
    expect(type.cast(Number.NaN)).toBeNull();
    expect(type.cast(1.0 / 0.0)).toBeNull();
  });

  it("casting booleans for database", () => {
    const type = new Types.IntegerType();
    expect(type.serialize(true)).toBe(1);
    expect(type.serialize(false)).toBe(0);
  });

  it("casting duration", () => {
    const type = new Types.IntegerType();
    expect(type.cast(minutes(30))).toBe(1800);
    expect(type.cast(hours(2))).toBe(7200);
  });

  it("casting string for database", () => {
    const type = new Types.IntegerType();
    expect(type.serialize("wibble")).toBeNull();
    expect(type.serialize("5wibble")).toBe(5);
    expect(type.serialize(" +5")).toBe(5);
    expect(type.serialize(" -5")).toBe(-5);
  });

  it("casting empty string", () => {
    const type = new Types.IntegerType();
    expect(type.cast("")).toBeNull();
    expect(type.serialize("")).toBeNull();
    expect(type.deserialize("")).toBeNull();
  });

  it("changed?", () => {
    const type = new Types.IntegerType();

    expect(type.isChanged(0, 0, "wibble")).toBeTruthy();
    expect(type.isChanged(5, 0, "wibble")).toBeTruthy();
    expect(type.isChanged(5, 5, "5wibble")).toBeFalsy();
    expect(type.isChanged(5, 5, "5")).toBeFalsy();
    expect(type.isChanged(5, 5, "5.0")).toBeFalsy();
    expect(type.isChanged(5, 5, "+5")).toBeFalsy();
    expect(type.isChanged(5, 5, "+5.0")).toBeFalsy();
    expect(type.isChanged(-5, -5, "-5")).toBeFalsy();
    expect(type.isChanged(-5, -5, "-5.0")).toBeFalsy();
    expect(type.isChanged(null, null, null)).toBeFalsy();
  });

  it("values below int min value are out of range", () => {
    expect(() => new Integer().serialize(-2147483649)).toThrow(RangeError);
  });

  it("values above int max value are out of range", () => {
    expect(() => new Integer().serialize(2147483648)).toThrow(RangeError);
  });

  it("very small numbers are out of range", () => {
    expect(() => new Integer().serialize(-9999999999999999999999999999999n)).toThrow(RangeError);
  });

  it("very large numbers are out of range", () => {
    expect(() => new Integer().serialize(9999999999999999999999999999999n)).toThrow(RangeError);
  });

  it("normal numbers are in range", () => {
    const type = new Integer();
    expect(type.serialize(0)).toBe(0);
    expect(type.serialize(-1)).toBe(-1);
    expect(type.serialize(1)).toBe(1);
  });

  it("int max value is in range", () => {
    expect(new Integer().serialize(2147483647)).toBe(2147483647);
  });

  it("int min value is in range", () => {
    expect(new Integer().serialize(-2147483648)).toBe(-2147483648);
  });

  it("columns with a larger limit have larger ranges", () => {
    const type = new Integer({ limit: 8 });

    expect(type.serialize(9223372036854775807n)).toBe(9223372036854775807n);
    expect(type.serialize(-9223372036854775808n)).toBe(-9223372036854775808n);
    expect(() => type.serialize(-9999999999999999999999999999999n)).toThrow(RangeError);
    expect(() => type.serialize(9999999999999999999999999999999n)).toThrow(RangeError);
  });

  it("serialize_cast_value enforces range", () => {
    const type = new Integer();

    expect(() => type.serializeCastValue(-2147483649)).toThrow(RangeError);

    expect(() => type.serializeCastValue(2147483648)).toThrow(RangeError);
  });
});
