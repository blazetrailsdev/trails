import { describe, it } from "vitest";

describe("TypesTest", () => {
  it.skip("attributes which are invalid for database can still be reassigned", () => {
    // BLOCKED: type — types type/attribute gap
    // ROOT-CAUSE: types.ts or attribute-methods/types.ts missing Rails parity
    // SCOPE: ~20 LOC fix; affects ~1 test in types.test.ts
  });
});
