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

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("cast strings are mutable", () => {
    const type = new Types.StringType();

    const s = "foo";
    expect(Object.isFrozen(type.cast(s))).toEqual(false);
    expect(Object.isFrozen(s)).toEqual(false);

    const f = "foo";
    expect(Object.isFrozen(type.cast(f))).toEqual(false);
    expect(Object.isFrozen(f)).toEqual(true);
  });

  // BLOCKED: assertions-immutable-js-string-values
  it.skip("values are duped coming out", () => {
    const type = new Types.StringType();

    const s = "foo";
    expect(type.cast(s)).not.toBe(s);
    expect(type.cast(s)).toEqual(s);
    expect(type.deserialize(s)).not.toBe(s);
    expect(type.deserialize(s)).toEqual(s);
  });
});
