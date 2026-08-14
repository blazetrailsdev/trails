import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("TimeTypeTrails", () => {
  it("serialize_cast_value applies the declared precision", () => {
    const type = new Types.TimeType({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");

    expect(String(type.serializeCastValue(value))).toBe("2000-01-01T22:34:56.7Z");
  });
});
