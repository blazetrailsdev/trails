import { describe, it, expect } from "vitest";
import { LazyAttributeHash } from "./builder.js";
import { typeRegistry } from "../type/registry.js";

describe("LazyAttributeHash", () => {
  const intType = typeRegistry.lookup("integer");

  it("deep_dup carries the receiver's materialized flag", () => {
    const hash = new LazyAttributeHash(new Map([["age", intType]]), { age: "42" });
    hash.transformValues((attr) => attr);
    expect((hash.deepDup() as unknown as { materialized: boolean }).materialized).toBe(true);
  });
});
