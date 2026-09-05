import { describe, it, expect } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { Time, Value } from "./time.js";

describe("TimeTest", () => {
  it("default year is correct", () => {
    const type = new Time();
    const result = type.cast({ 4: 10, 5: 30 }) as RubyTime;
    expect(result).toEqual(RubyTime.utc(2000, 1, 1, 10, 30, 0));
  });

  it("serialize wraps the cast time in Type::Time::Value", () => {
    const type = new Time();
    const serialized = type.serialize("10:30:00");
    expect(serialized).toBeInstanceOf(Value);
    expect(((serialized as Value).getobj() as RubyTime).getutc().xmlschema()).toBe(
      "2000-01-01T10:30:00Z",
    );
    expect(type.serialize(null)).toBe(null);
  });

  it("cast unwraps a Type::Time::Value", () => {
    const type = new Time();
    const value = type.serialize("10:30:00") as Value;
    expect(type.cast(value)).toEqual(value.getobj());
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Time({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00") as RubyTime;
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
