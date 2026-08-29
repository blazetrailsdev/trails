import { describe, it, expect, vi } from "vitest";
import { ArgumentError, assertSame } from "@blazetrails/activesupport";
import { StatementPool } from "./statement-pool.js";
import { isSqliteRun } from "../support/sqlite-template.js";
import { checkoutRawTestAdapter } from "../test-adapter.js";

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
    expect(await pool.delete(sql)).toBeUndefined();
  });

  it("#delete calls dealloc when statement exists", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool();
    await pool.set("key", "prepared_stmt");
    await pool.delete("key");
    expect(dealloced).toEqual(["prepared_stmt"]);
    expect(pool.length).toBe(0);
  });

  it("clear calls dealloc for each statement", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool();
    await pool.set("a", "stmt_a");
    await pool.set("b", "stmt_b");
    await pool.clear();
    expect(dealloced.sort()).toEqual(["stmt_a", "stmt_b"]);
    expect(pool.length).toBe(0);
  });

  it("reset clears without calling dealloc", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool();
    await pool.set("a", "stmt_a");
    await pool.set("b", "stmt_b");
    pool.reset();
    expect(dealloced).toHaveLength(0);
    expect(pool.length).toBe(0);
  });

  it("each iterates over all entries", async () => {
    const pool = new StatementPool<string>();
    await pool.set("a", "1");
    await pool.set("b", "2");
    const entries: [string, string][] = [];
    pool.each((key, stmt) => entries.push([key, stmt]));
    expect(entries).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("evicts oldest when exceeding max size", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool(2);
    await pool.set("a", "1");
    await pool.set("b", "2");
    await pool.set("c", "3");
    expect(pool.length).toBe(2);
    expect(pool.isKey("a")).toBe(false);
    expect(pool.isKey("b")).toBe(true);
    expect(pool.isKey("c")).toBe(true);
    expect(dealloced).toEqual(["1"]);
  });

  it("LRU: get moves entry to end", async () => {
    const pool = new StatementPool<string>(2);
    await pool.set("a", "1");
    await pool.set("b", "2");
    pool.get("a");
    await pool.set("c", "3");
    expect(pool.isKey("a")).toBe(true);
    expect(pool.isKey("b")).toBe(false);
    expect(pool.isKey("c")).toBe(true);
  });

  it("key? reports membership", async () => {
    const pool = new StatementPool<string>();
    await pool.set("a", "1");
    expect(pool.isKey("a")).toBe(true);
    expect(pool.isKey("b")).toBe(false);
  });
});

describe("SQLite3 StatementPool integration", () => {
  it.skipIf(!isSqliteRun())("caches prepared statements across execute calls", async () => {
    const { adapter, pool: adapterPool } = await checkoutRawTestAdapter();
    const prepareSpy = vi.spyOn((adapter as any).driver, "prepare");

    try {
      await adapter.executeMutation('DROP TABLE IF EXISTS "test_pool"');
      await adapter.executeMutation(
        'CREATE TABLE "test_pool" ("id" INTEGER PRIMARY KEY, "name" TEXT)',
      );
      await adapter.executeMutation('INSERT INTO "test_pool" ("name") VALUES (?)', ["a"]);
      await adapter.executeMutation('INSERT INTO "test_pool" ("name") VALUES (?)', ["b"]);

      const selectSql = 'SELECT * FROM "test_pool" WHERE "name" = ?';
      const rows1 = (
        await adapter.internalExecQuery(selectSql, "SQL", ["a"], { prepare: true })
      ).toArray();
      const rows2 = (
        await adapter.internalExecQuery(selectSql, "SQL", ["b"], { prepare: true })
      ).toArray();
      expect(rows1).toHaveLength(1);
      expect(rows1[0].name).toBe("a");
      expect(rows2).toHaveLength(1);
      expect(rows2[0].name).toBe("b");

      const selectCalls = prepareSpy.mock.calls.filter((c) => c[0] === selectSql);
      expect(selectCalls).toHaveLength(1);
    } finally {
      prepareSpy.mockRestore();
      await adapter.executeMutation('DROP TABLE IF EXISTS "test_pool"');
      adapterPool.releaseConnection();
      await adapterPool.disconnectBang();
    }
  });

  it("evicts LRU entries through dealloc once the statement limit is reached", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool(2);
    await pool.set("a", "stmt_a");
    await pool.set("b", "stmt_b");
    pool.get("a");
    await pool.set("c", "stmt_c");
    expect(pool.length).toBe(2);
    expect(pool.isKey("a")).toBe(true);
    expect(dealloced).toEqual(["stmt_b"]);
  });

  it("a statement limit of 0 raises on the first insert", async () => {
    const pool = new StatementPool<string>(0);
    expect(() => pool.set("c", "stmt_c")).toThrow();
    expect(pool.length).toBe(0);
  });

  it("threads an asynchronous dealloc back to the eviction site", async () => {
    const order: string[] = [];
    class TestPool extends StatementPool<string> {
      private _chain: Promise<void> = Promise.resolve();
      protected dealloc(stmt: string): Promise<void> {
        this._chain = this._chain.then(() => Promise.resolve()).then(() => void order.push(stmt));
        return this._chain;
      }
    }
    const pool = new TestPool(1);
    await pool.set("a", "stmt_a");
    await pool.set("b", "stmt_b");
    order.push("eviction-site-resumed");
    await pool.clear();
    expect(order).toEqual(["stmt_a", "eviction-site-resumed", "stmt_b"]);
  });
});
