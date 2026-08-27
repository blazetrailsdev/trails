import { describe, it, expect } from "vitest";
import { Array as OidArray } from "./array.js";

describe("PostgreSQL array deserialize of an already-decoded array", () => {
  const subtype = {
    cast: (value: unknown) => `cast(${String(value)})`,
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => `deserialize(${String(value)})`,
  };

  it("routes elements through the subtype's deserialize, not its cast", () => {
    const type = new OidArray(subtype);

    expect(type.deserialize(["a", "b"])).toEqual(["deserialize(a)", "deserialize(b)"]);
  });

  it("recurses into nested arrays through deserialize", () => {
    const type = new OidArray(subtype);

    expect(type.deserialize([["a"], ["b"]])).toEqual([["deserialize(a)"], ["deserialize(b)"]]);
  });

  it("still routes cast of an already-decoded array through the subtype's cast", () => {
    const type = new OidArray(subtype);

    expect(type.cast(["a"])).toEqual(["cast(a)"]);
  });
});
