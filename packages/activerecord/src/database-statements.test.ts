import { describe, it, expect } from "vitest";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";

// Mirrors Rails' DatabaseStatementsTest. Each test leases a fresh in-memory
// connection against the accounts table the corresponding Rails fixtures
// materialize, created inline here so the suite stays self-contained.
async function returnTheInsertedId(method: "insert" | "create"): Promise<unknown> {
  const conn = new BetterSQLite3Adapter(":memory:");
  try {
    await conn.executeMutation(
      "CREATE TABLE accounts (id integer PRIMARY KEY, firm_id integer, credit_limit integer)",
    );
    const result = await conn[method](
      "INSERT INTO accounts (firm_id,credit_limit) VALUES (42,5000)",
    );
    await conn.executeMutation("DROP TABLE IF EXISTS accounts");
    return result;
  } finally {
    await conn.close();
  }
}

describe("DatabaseStatementsTest", () => {
  it("insert should return the inserted id", async () => {
    expect(await returnTheInsertedId("insert")).not.toBeNull();
  });
  it("create should return the inserted id", async () => {
    expect(await returnTheInsertedId("create")).not.toBeNull();
  });
});
