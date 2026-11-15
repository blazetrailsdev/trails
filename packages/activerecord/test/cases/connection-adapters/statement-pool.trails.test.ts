import { describe, it, expect, vi } from "vitest";
import { StatementPool } from "../../../lib/connection-adapters/statement-pool.js";
import { isSqliteRun } from "../../support/sqlite-template.js";
import { checkoutRawTestAdapter } from "../../support/test-adapter.js";

class EvictingPool extends StatementPool<string> {
  protected dealloc(_stmt: string): void {}
}

describe("StatementPool (trails)", () => {
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

  it("evicts in insertion order regardless of reads", async () => {
    const pool = new EvictingPool(2);
    await pool.set("a", "1");
    await pool.set("b", "2");
    pool.get("a");
    await pool.set("c", "3");
    expect(pool.isKey("a")).toBe(false);
    expect(pool.isKey("b")).toBe(true);
    expect(pool.isKey("c")).toBe(true);
  });

  it("evicts before storing, so a full pool sheds its oldest entry on re-assign", async () => {
    const pool = new EvictingPool(2);
    await pool.set("a", "1");
    await pool.set("b", "2");
    await pool.set("a", "1b");
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
    await adapter.connectBang();
    const prepareSpy = vi.spyOn(
      (adapter as unknown as { _rawConnection: { prepare(sql: string): unknown } })._rawConnection,
      "prepare",
    );

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
    await expect(pool.set("c", "stmt_c")).rejects.toThrow();
    expect(pool.length).toBe(0);
  });

  it("clear empties the pool before it returns when dealloc is still pending", async () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected async dealloc(stmt: string): Promise<void> {
        dealloced.push(stmt);
        await Promise.resolve();
      }
    }
    const pool = new TestPool();
    await pool.set("a", "stmt_a");
    await pool.set("b", "stmt_b");
    await pool.clear();
    expect(pool.length).toBe(0);
    expect(dealloced).toEqual(["stmt_a", "stmt_b"]);
  });
});
