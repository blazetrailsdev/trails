import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";

describe("DatabaseStatementsRawExecuteTest (trails)", () => {
  fixtures({});

  it("rawExecute runs a read through the adapter's performQuery", async () => {
    const connection = await Base.leaseConnection();
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
