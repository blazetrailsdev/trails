import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("BinaryTest", () => {
    it("type cast binary", () => {
      const type = new Types.BinaryType();
      expect(type.cast(null)).toBe(null);
      const result = type.cast("hello");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result!)).toBe("hello");
    });

    it("serialize binary strings", () => {
      const type = new Types.BinaryType();
      const result = type.serialize("hello");
      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
