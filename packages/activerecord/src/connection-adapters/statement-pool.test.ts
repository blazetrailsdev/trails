import { describe, it, expect } from "vitest";
import { ArgumentError, assertSame } from "@blazetrails/activesupport";
import { StatementPool } from "./statement-pool.js";

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
    pool.set(sql, stmt);
    assertSame(stmt, pool.get(sql));
    assertSame(stmt, pool.delete(sql));
    expect(pool.delete(sql)).toBeUndefined();
  });
});
