import { describe, it } from "vitest";

describe("IntegerTest", () => {
  it.skip("casting ActiveRecord models", () => {
    // BLOCKED: type — type cast/serialize/deserialize gap in integer
    // ROOT-CAUSE: type/integer.ts or attribute-types.ts missing Rails parity
    // SCOPE: ~20–100 LOC fix in type/; affects ~2–18 tests in integer.test.ts
  });
  it.skip("values which are out of range can be re-assigned", () => {
    // BLOCKED: type — type cast/serialize/deserialize gap in integer
    // ROOT-CAUSE: type/integer.ts or attribute-types.ts missing Rails parity
    // SCOPE: ~20–100 LOC fix in type/; affects ~2–18 tests in integer.test.ts
  });
});
