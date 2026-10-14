import { describe, it, expect } from "vitest";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import { UnsignedInteger } from "./unsigned-integer.js";

describe("UnsignedIntegerTest", () => {
  it("unsigned int max value is in range", () => {
    expect(new UnsignedInteger().serialize(4294967295)).toBe(4294967295);
  });

  it("minus value is out of range", () => {
    expect(() => new UnsignedInteger().serialize(-1)).toThrow(ActiveModelRangeError);
  });

  it("serialize_cast_value enforces range", () => {
    const type = new UnsignedInteger();
    expect(() => type.serializeCastValue(-1)).toThrow(ActiveModelRangeError);
    expect(() => type.serializeCastValue(4294967296)).toThrow(ActiveModelRangeError);
  });
});
