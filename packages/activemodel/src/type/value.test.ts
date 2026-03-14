import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("Type Value", () => {
    it("type equality", () => {
      const type1 = Types.typeRegistry.lookup("value");
      const type2 = Types.typeRegistry.lookup("value");
      expect(type1.constructor).toBe(type2.constructor);
    });

    it("as json not defined", () => {
      const type = Types.typeRegistry.lookup("value");
      // Value type passes through without transformation
      expect(type.cast("hello")).toBe("hello");
      expect(type.cast(42)).toBe(42);
      expect(type.cast(null)).toBe(null);
    });
  });
});
