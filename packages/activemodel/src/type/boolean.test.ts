import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";

describe("ActiveModel", () => {
  describe("Type Boolean (ported)", () => {
    it("type cast boolean", () => {
      const type = new Types.BooleanType();
      expect(type.cast(true)).toBe(true);
      expect(type.cast(false)).toBe(false);
      expect(type.cast("true")).toBe(true);
      expect(type.cast("false")).toBe(false);
      expect(type.cast("1")).toBe(true);
      expect(type.cast("0")).toBe(false);
      expect(type.cast(1)).toBe(true);
      expect(type.cast(0)).toBe(false);
      expect(type.cast("yes")).toBe(true);
      expect(type.cast("no")).toBe(false);
      expect(type.cast(null)).toBe(null);
    });
  });
});
