import { describe, it } from "vitest";

describe("ConnectionTest", () => {
  it.skip("#type_for_attribute is not aware of custom types", () => {
    // BLOCKED: type — connection type/attribute gap
    // ROOT-CAUSE: connection.ts or attribute-methods/connection.ts missing Rails parity
    // SCOPE: ~20 LOC fix; affects ~1 test in connection.test.ts
  });
});
