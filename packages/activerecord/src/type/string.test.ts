import { describe, it } from "vitest";

describe("StringTypeTest", () => {
  it.skip("string mutations are detected", () => {
    // BLOCKED: type — type cast/serialize/deserialize gap in string
    // ROOT-CAUSE: type/string.ts or attribute-types.ts missing Rails parity
    // SCOPE: ~20–100 LOC fix in type/; affects ~2–18 tests in string.test.ts
  });
});
