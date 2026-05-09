import { describe, it, expect } from "vitest";
import { Time } from "./time.js";

describe("TimeTest", () => {
  it.skip("default year is correct", () => {
    // BLOCKED: multiparameter hash-key assignment not implemented
    // Rails: Topic.new(bonus_time: { 4 => 10, 5 => 30 }) uses numeric-keyed
    // hash form from form helpers; our multiparameter assignment doesn't handle it.
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Time({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
