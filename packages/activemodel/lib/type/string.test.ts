import { describe, it, expect } from "vitest";
import * as Types from "../index.js";

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

  // PERMANENT-SKIP: a JS string is an immutable primitive with no identity (CLAUDE.md, "Ruby Strings are JS string primitives").
  it.skip("cast strings are mutable", () => {
    const type = new Types.StringType();

    const s = "foo";
    expect(Object.isFrozen(type.cast(s))).toEqual(false);
    expect(Object.isFrozen(s)).toEqual(false);

    const f = "foo";
    expect(Object.isFrozen(type.cast(f))).toEqual(false);
    expect(Object.isFrozen(f)).toEqual(true);
  });

  it("values are duped coming out", () => {
    const type = new Types.StringType();

    const s = "foo";
    expect(type.cast(s)).toEqual(s);
    expect(type.deserialize(s)).toEqual(s);
  });
});
