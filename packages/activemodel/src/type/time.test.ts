import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("TimeTest", () => {
    it("type cast time", () => {
      const type = new Types.TimeType();
      expect(type.cast(null)).toBe(null);
      expect(type.cast("")).toBe(null);
      expect(type.cast("ABC")).toBe(null);

      const result = type.cast("2024-01-15T10:30:00Z");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getUTCHours()).toBe(10);
    });

    it("user input in time zone", () => {
      const type = new Types.TimeType();
      const result = type.cast("2015-02-09T19:45:54+00:00");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getUTCHours()).toBe(19);
    });

    it("serialize_cast_value is equivalent to serialize after cast", () => {
      const type = new Types.TimeType();
      const cast = type.cast("2024-01-15T10:30:00Z");
      const serialized = type.serialize(cast);
      expect(serialized).toEqual(cast);
    });
  });
});
