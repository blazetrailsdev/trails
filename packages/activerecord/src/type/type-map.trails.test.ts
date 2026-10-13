import { describe, it, expect } from "vitest";
import type { ValueType } from "@blazetrails/activemodel";
import { HashLookupTypeMap } from "./hash-lookup-type-map.js";

describe("HashLookupTypeMapTest", () => {
  it("isKey returns true for registered keys and false otherwise", () => {
    const mapping = new HashLookupTypeMap();
    mapping.registerType("foo", { name: "foo" } as unknown as ValueType);

    expect(mapping.isKey("foo")).toBe(true);
    expect(mapping.isKey("bar")).toBe(false);
  });
});
