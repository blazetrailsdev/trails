import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("StringType#toImmutableString", () => {
  it("toImmutableString propagates true and false", () => {
    const type = new Types.StringType({ true: "aye", false: "nay" });
    expect(type.toImmutableString().cast(true)).toBe("aye");
    expect(type.toImmutableString().cast(false)).toBe("nay");
  });
});

describe("StringType", () => {
  describe("isChangedInPlace", () => {
    it("non-string new value returns false", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace("42", 42)).toBe(false);
      expect(type.isChangedInPlace("hello", null)).toBe(false);
      expect(type.isChangedInPlace("", true)).toBe(false);
    });

    it("same string returns false", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace("hello", "hello")).toBe(false);
    });

    it("different string returns true", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace("hello", "world")).toBe(true);
    });

    it("null rawOldValue with string newValue returns true", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace(null, "hello")).toBe(true);
    });

    it("undefined rawOldValue with string newValue returns true", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace(undefined, "hello")).toBe(true);
    });

    it("null rawOldValue with non-string newValue returns false", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace(null, 42)).toBe(false);
    });

    it("empty string newValue is still a string", () => {
      const type = new Types.StringType();
      expect(type.isChangedInPlace("hello", "")).toBe(true);
    });
  });
});
