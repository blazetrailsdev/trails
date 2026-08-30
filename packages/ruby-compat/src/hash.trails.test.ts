import { describe, expect, it } from "vitest";
import { fetch, hasKey } from "./hash.js";

describe("Hash#fetch", () => {
  it("returns a stored null rather than the default", () => {
    expect(fetch({ offset: null }, "offset", 0)).toBeNull();
  });

  it("returns a stored false rather than the default", () => {
    expect(fetch({ verbose: false }, "verbose", true)).toBe(false);
  });

  it("returns a stored undefined rather than the default", () => {
    expect(fetch({ offset: undefined }, "offset", 0)).toBeUndefined();
  });

  it("does not read an inherited JavaScript property as a stored key", () => {
    expect(fetch({}, "toString", "default")).toBe("default");
    expect(() => fetch({}, "toString")).toThrow('key not found: "toString"');
    expect(hasKey({}, "toString")).toBe(false);
  });

  it("returns the default for an absent key", () => {
    expect(fetch({}, "offset", 0)).toBe(0);
  });

  it("raises KeyError with the quoted key when no default is given", () => {
    expect(() => fetch({}, "expression")).toThrow('key not found: "expression"');
  });

  it("raises KeyError keeping a Symbol key's colon", () => {
    expect(() => fetch({}, ":expression")).toThrow("key not found: :expression");
  });

  it("raises a KeyError, not a plain Error", () => {
    let name: string | undefined;
    try {
      fetch({}, "k");
    } catch (error) {
      name = (error as Error).name;
    }
    expect(name).toBe("KeyError");
  });
});

describe("Hash#key?", () => {
  it("is true for a stored null", () => {
    expect(hasKey({ offset: null }, "offset")).toBe(true);
  });

  it("is false for an absent key", () => {
    expect(hasKey({}, "offset")).toBe(false);
  });
});
