import { describe, it } from "vitest";

describe("DateTimeTest", () => {
  it.skip("datetime seconds precision applied to timestamp", () => {
    // BLOCKED: type — type cast/serialize/deserialize gap in date-time
    // ROOT-CAUSE: type/date-time.ts or attribute-types.ts missing Rails parity
    // SCOPE: ~20–100 LOC fix in type/; affects ~2–18 tests in date-time.test.ts
  });
  it.skip("serialize_cast_value is equivalent to serialize after cast", () => {
    // BLOCKED: type — type cast/serialize/deserialize gap in date-time
    // ROOT-CAUSE: type/date-time.ts or attribute-types.ts missing Rails parity
    // SCOPE: ~20–100 LOC fix in type/; affects ~2–18 tests in date-time.test.ts
  });
});
