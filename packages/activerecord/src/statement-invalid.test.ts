import { describe, it } from "vitest";

describe("StatementInvalidTest", () => {
  it.skip("message contains no sql", () => {
    // BLOCKED: relation — statement-invalid feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for statement_invalid
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in statement-invalid.test.ts
  });
  it.skip("statement and binds are set on select", () => {
    // BLOCKED: relation — statement-invalid feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for statement_invalid
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in statement-invalid.test.ts
  });
});
