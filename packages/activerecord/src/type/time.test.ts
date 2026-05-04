import { describe, it, expect } from "vitest";
import { Time } from "./time.js";

describe("TimeTest", () => {
  it.skip("default year is correct", () => {});

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Time({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");
    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
