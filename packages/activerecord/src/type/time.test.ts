import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Time } from "./time.js";

describe("TimeTest", () => {
  it("default year is correct", () => {
    const type = new Time();
    const result = type.cast({ 4: 10, 5: 30 }) as Temporal.PlainTime;
    expect(result).toBeInstanceOf(Temporal.PlainTime);
    expect(result.hour).toBe(10);
    expect(result.minute).toBe(30);
    expect(result.second).toBe(0);
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Time({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
