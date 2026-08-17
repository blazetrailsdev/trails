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
    // Rails' `Object.new` stands for "any value that is neither a Numeric, a
    // Symbol, a Duration nor a boolean" — immutable_string.rb:52-58 sends all of
    // those to `super`, i.e. straight back out.
    const object = {},
      array = [true],
      hash = { a: ":b" };
    expect(type.serialize(object)).toBe(object);
    expect(type.serialize(array)).toBe(array);
    expect(type.serialize(hash)).toBe(hash);
  });

  it("cast strings are mutable", () => {
    const type = new Types.StringType();
    // Rails asserts `type.cast(s).frozen? == false` for both a mutable (+"foo")
    // and a frozen (-"foo") receiver: `String#cast_value` runs `::String.new(value)`
    // (string.rb:35), so the result is always an unfrozen copy. JS strings are
    // immutable primitives, so `frozen?` has no counterpart — there is nothing
    // to assert beyond the cast itself.
    expect(type.cast("foo")).toBe("foo");
  });

  it("values are duped coming out", () => {
    const type = new Types.StringType();
    const s = "foo";
    // Rails' `assert_not_same s, type.cast(s)` pins the `::String.new(value)`
    // copy. JS strings are primitives with no identity distinct from their
    // value, so `not_same` cannot be expressed — only the `assert_equal` arms
    // port.
    expect(type.cast(s)).toBe(s);
    expect(type.deserialize(s)).toBe(s);
  });

  it("toImmutableString propagates true and false", () => {
    const type = new Types.StringType({ true: "aye", false: "nay" });
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
