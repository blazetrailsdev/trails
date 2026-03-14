import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("DateTimeTest", () => {
    it("type cast datetime and timestamp", () => {
      const type = new Types.DateTimeType();
      const result = type.cast("2024-01-15T10:30:00Z");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getUTCHours()).toBe(10);
    });

    it("string to time with timezone", () => {
      const type = new Types.DateTimeType();
      const result = type.cast("2024-01-15T10:30:00+05:00");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getUTCHours()).toBe(5);
    });

    it("hash to time", () => {
      const type = new Types.DateTimeType();
      const result = type.cast("2024-06-15T12:00:00Z");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getUTCMonth()).toBe(5);
    });

    it("hash with wrong keys", () => {
      const type = new Types.DateTimeType();
      expect(type.cast("not-a-date")).toBe(null);
    });

    it("serialize_cast_value is equivalent to serialize after cast", () => {
      const type = new Types.DateTimeType();
      const cast = type.cast("2024-01-15T10:30:00Z");
      const serialized = type.serialize("2024-01-15T10:30:00Z");
      expect(serialized).toEqual(cast);
    });
  });
});
