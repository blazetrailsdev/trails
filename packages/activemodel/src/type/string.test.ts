import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("StringTest", () => {
  it("type casting", () => {
    const type = new Types.StringType();
    // Rails type/string.rb inherits from type/immutable_string.rb#cast_value,
    // which maps true/false to the PG literal form "t"/"f".
    expect(type.cast(true)).toBe("t");
    expect(type.cast(false)).toBe("f");
    expect(type.cast(123)).toBe("123");
  });

  it("type casting for database", () => {
    const type = new Types.StringType();
    expect(type.serialize("hello")).toBe("hello");
    expect(type.serialize(123)).toBe("123");
  });

  it("cast strings are mutable", () => {
    const type = new Types.StringType();
    const result = type.cast("foo");
    expect(typeof result).toBe("string");
  });

  it("values are duped coming out", () => {
    const type = new Types.StringType();
    const s = "foo";
    const cast = type.cast(s);
    expect(cast).toBe("foo");
  });

  it("toImmutableString propagates trueString and falseString", () => {
    const type = new Types.StringType({ trueString: "aye", falseString: "nay" });
    expect(type.toImmutableString().cast(true)).toBe("aye");
    expect(type.toImmutableString().cast(false)).toBe("nay");
  });

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
