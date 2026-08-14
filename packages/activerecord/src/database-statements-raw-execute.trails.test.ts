/**
 * trails-only coverage for `raw_execute` reaching each adapter's
 * `perform_query`.
 *
 * Rails' `raw_execute` is `log { with_raw_connection { perform_query(...) } }`
 * (abstract/database_statements.rb:552-559) and every adapter defines
 * `perform_query` with that argument list (postgresql:135, mysql2:41,
 * sqlite3:78). Until those were wired onto the prototype, `raw_execute` fell
 * through to the abstract `NotImplementedError` stub, so the primitive was only
 * reachable through the adapters' own `execute` paths.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";

describe("DatabaseStatementsRawExecuteTest (trails)", () => {
  fixtures({});

  it("rawExecute runs a read through the adapter's performQuery", async () => {
    const connection = await Base.leaseConnection();
    // Every adapter's perform_query yields its driver's native result, and all
    // three of ours carry the rows on `rows` — an empty array for a read that
    // matches nothing.
    const result = (await (
      connection as never as { rawExecute(sql: string, name?: string): Promise<unknown> }
    ).rawExecute("SELECT credit_limit FROM accounts WHERE 1 = 0", "SQL")) as { rows: unknown[] };
    expect(result.rows).toEqual([]);
  });

  it("rawExecute runs a write through the adapter's performQuery", async () => {
    const connection = await Base.leaseConnection();
    await (
      connection as never as { rawExecute(sql: string, name?: string): Promise<unknown> }
    ).rawExecute("INSERT INTO accounts (id, firm_id, credit_limit) VALUES (9999, 42, 5000)", "SQL");

    expect(
      Number(await connection.selectValue("SELECT credit_limit FROM accounts WHERE id = 9999")),
    ).toBe(5000);
  });
});
