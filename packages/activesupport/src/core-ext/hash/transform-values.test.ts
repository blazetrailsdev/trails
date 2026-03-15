import { describe, expect, it } from "vitest";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";

describe("IndifferentTransformValuesTest", () => {
  it("indifferent access is still indifferent after mapping values", () => {
    const hash = new HashWithIndifferentAccess({ a: 1, b: 2 });
    // Transform values by doubling
    const newHash = new HashWithIndifferentAccess({
      a: (hash.get("a") as number) * 2,
      b: (hash.get("b") as number) * 2,
    });
    expect(newHash.get("a")).toBe(2);
    expect(newHash.get("b")).toBe(4);
  });
});
