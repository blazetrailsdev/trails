import { describe, it, expect, vi } from "vitest";
import { ArgumentError, assertSame } from "@blazetrails/activesupport";
import { StatementPool } from "./statement-pool.js";
import { isSqliteRun } from "../support/sqlite-template.js";
import { checkoutRawTestAdapter } from "../test-adapter.js";

class EvictingPool extends StatementPool<string> {
  protected dealloc(_stmt: string): void {}
}

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

  it("#delete calls dealloc when statement exists", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool();
    pool.set("key", "prepared_stmt");
    pool.delete("key");
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
    pool.set("a", "stmt_a");
    pool.set("b", "stmt_b");
    pool.clear();
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
    pool.set("a", "stmt_a");
    pool.set("b", "stmt_b");
    pool.reset();
    expect(dealloced).toHaveLength(0);
    expect(pool.length).toBe(0);
  });

  it("each iterates over all entries", async () => {
    const pool = new StatementPool<string>();
    pool.set("a", "1");
    pool.set("b", "2");
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
    pool.set("a", "1");
    pool.set("b", "2");
    pool.set("c", "3");
    expect(pool.length).toBe(2);
    expect(pool.isKey("a")).toBe(false);
    expect(pool.isKey("b")).toBe(true);
    expect(pool.isKey("c")).toBe(true);
    expect(dealloced).toEqual(["1"]);
  });

  it("evicts in insertion order regardless of reads", async () => {
    const pool = new EvictingPool(2);
    pool.set("a", "1");
    pool.set("b", "2");
    pool.get("a");
    pool.set("c", "3");
    expect(pool.isKey("a")).toBe(false);
    expect(pool.isKey("b")).toBe(true);
    expect(pool.isKey("c")).toBe(true);
  });

  it("evicts before storing, so a full pool sheds its oldest entry on re-assign", async () => {
    const pool = new EvictingPool(2);
    pool.set("a", "1");
    pool.set("b", "2");
    pool.set("a", "1b");
    pool.set("c", "3");
    expect(pool.isKey("a")).toBe(true);
    expect(pool.isKey("b")).toBe(false);
    expect(pool.isKey("c")).toBe(true);
  });

  it("key? reports membership", async () => {
    const pool = new StatementPool<string>();
    pool.set("a", "1");
    expect(pool.isKey("a")).toBe(true);
    expect(pool.isKey("b")).toBe(false);
  });
});

describe("SQLite3 StatementPool integration", () => {
  it.skipIf(!isSqliteRun())("caches prepared statements across execute calls", async () => {
    const { adapter, pool: adapterPool } = await checkoutRawTestAdapter();
    await adapter.connectBang();
    const prepareSpy = vi.spyOn((adapter as any)._rawConnection, "prepare");

    try {
      await adapter.execute('DROP TABLE IF EXISTS "test_pool"');
      await adapter.execute('CREATE TABLE "test_pool" ("id" INTEGER PRIMARY KEY, "name" TEXT)');
      await adapter.execInsert('INSERT INTO "test_pool" ("name") VALUES (?)', null, ["a"]);
      await adapter.execInsert('INSERT INTO "test_pool" ("name") VALUES (?)', null, ["b"]);

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
      await adapter.execute('DROP TABLE IF EXISTS "test_pool"');
      adapterPool.releaseConnection();
      await adapterPool.disconnectBang();
    }
  });

  it("a statement limit of 0 raises on the first insert", async () => {
    const pool = new StatementPool<string>(0);
    expect(() => pool.set("c", "stmt_c")).toThrow();
    expect(pool.length).toBe(0);
  });

  it("clear empties the pool before it returns when dealloc is still pending", () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected async dealloc(stmt: string): Promise<void> {
        dealloced.push(stmt);
        await Promise.resolve();
      }
    }
    const pool = new TestPool();
    pool.set("a", "stmt_a");
    pool.set("b", "stmt_b");
    pool.clear();
    expect(pool.length).toBe(0);
    expect(dealloced).toEqual(["stmt_a", "stmt_b"]);
  });
});
