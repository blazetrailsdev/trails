import { describe, it } from "vitest";

describe("PreparedStatementStatusTest", () => {
  it.skip("prepared statement status is thread and instance specific", () => {
    // BLOCKED: relation — prepared-statement-status feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for prepared_statement_status
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in prepared-statement-status.test.ts
  });
});
