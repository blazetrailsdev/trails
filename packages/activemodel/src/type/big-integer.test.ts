import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";

describe("ActiveModel", () => {
  describe("Type BigInteger", () => {
    it("type cast big integer", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      expect(type.cast("42")).toBe(42n);
      expect(type.cast(null)).toBe(null);
    });

    it("BigInteger small values", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      expect(type.cast("0")).toBe(0n);
      expect(type.cast("1")).toBe(1n);
      expect(type.cast("-1")).toBe(-1n);
    });

    it("BigInteger large values", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      const large = "9999999999999999999999";
      expect(type.cast(large)).toBe(BigInt(large));
    });
  });
});
