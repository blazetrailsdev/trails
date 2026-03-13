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
  });
});
