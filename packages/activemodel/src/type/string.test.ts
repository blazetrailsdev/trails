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
});
