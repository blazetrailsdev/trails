import { describe, it } from "vitest";
import { ArgumentError } from "@blazetrails/activesupport";
import { assertNil, assertSame } from "@blazetrails/activesupport/testing/assertions";
import { StatementPool } from "../../../lib/connection-adapters/statement-pool.js";

describe("StatementPoolTest", () => {
  it("#delete doesn't call dealloc if the statement didn't exist", async () => {
    class TestPool extends StatementPool<object> {
      protected dealloc(stmt: object): void {
        if (!stmt) throw new ArgumentError();
      }
    }
    const pool = new TestPool();
    const stmt = {};
    const sql = "SELECT 1";
    await pool.set(sql, stmt);
    assertSame(stmt, pool.get(sql));
    assertSame(stmt, await pool.delete(sql));
    assertNil(await pool.delete(sql));
  });
});
