import { describe, it } from "vitest";

describe("DatabaseStatementsTest", () => {
  it.skip("insert should return the inserted id", () => {
    // BLOCKED: relation — database-statements feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for database_statements
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in database-statements.test.ts
    /* needs adapter-level insert() that returns last inserted ID */
  });
  it.skip("create should return the inserted id", () => {
    // BLOCKED: relation — database-statements feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for database_statements
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in database-statements.test.ts
    /* needs adapter-level insert() that returns last inserted ID */
  });
});
