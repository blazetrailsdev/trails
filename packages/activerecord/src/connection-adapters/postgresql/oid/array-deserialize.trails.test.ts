import { describe, it, expect } from "vitest";
import { Array as OidArray } from "./array.js";

describe("PostgreSQL array deserialize of an already-decoded array", () => {
  const subtype = {
    cast: (value: unknown) => `cast(${String(value)})`,
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => `deserialize(${String(value)})`,
    typeCastForSchema: (value: unknown) => value,
  };

  it("falls through to cast, as Type::Value#deserialize does", () => {
    const type = new OidArray(subtype);

    expect(type.deserialize(["a", "b"])).toEqual(["cast(a)", "cast(b)"]);
    expect(type.deserialize([["a"], ["b"]])).toEqual([["cast(a)"], ["cast(b)"]]);
  });

  it("routes the elements of an array literal through the subtype's deserialize", () => {
    const type = new OidArray(subtype);

    expect(type.deserialize("{a,b}")).toEqual(["deserialize(a)", "deserialize(b)"]);
    expect(type.deserialize("{{a},{b}}")).toEqual([["deserialize(a)"], ["deserialize(b)"]]);
  });

  it("still routes cast of an already-decoded array through the subtype's cast", () => {
    const type = new OidArray(subtype);

    expect(type.cast(["a"])).toEqual(["cast(a)"]);
  });
});
