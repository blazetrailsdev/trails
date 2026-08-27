import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("StringTest", () => {
  it("type casting", () => {
    const type = new Types.StringType();
    expect(type.cast(true)).toBe("t");
    expect(type.cast(false)).toBe("f");
    expect(type.cast(123)).toBe("123");
  });

  it("type casting for database", () => {
    const type = new Types.StringType();
    const object = {},
      array = [true],
      hash = { a: ":b" };
    expect(type.serialize(object)).toBe(object);
    expect(type.serialize(array)).toBe(array);
    expect(type.serialize(hash)).toBe(hash);
  });

  it("cast strings are mutable", () => {
    const type = new Types.StringType();
    expect(type.cast("foo")).toBe("foo");
  });

  it("values are duped coming out", () => {
    const type = new Types.StringType();
    const s = "foo";
    expect(type.cast(s)).toBe(s);
    expect(type.deserialize(s)).toBe(s);
  });
});
