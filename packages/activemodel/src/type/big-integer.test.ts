import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

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

    it("serialize_cast_value is equivalent to serialize after cast", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      const cast = type.cast("123");
      const serialized = type.serialize(cast);
      expect(cast).toBe(123n);
      expect(String(serialized)).toBe(String(cast));
    });

    it("small values", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      expect(type.cast(42)).toBe(42n);
    });

    it("large values", () => {
      const type = Types.typeRegistry.lookup("big_integer");
      expect(type.cast("99999999999999999999")).toBe(BigInt("99999999999999999999"));
    });
  });
});
