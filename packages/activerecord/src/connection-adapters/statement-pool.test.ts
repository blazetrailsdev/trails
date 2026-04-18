import { describe, it, expect, vi } from "vitest";
import { StatementPool } from "./statement-pool.js";

describe("StatementPoolTest", () => {
  it("#delete doesn't call dealloc if the statement didn't exist", () => {
    const dealloced: string[] = [];
    class TestPool extends StatementPool<string> {
      protected dealloc(stmt: string): void {
        dealloced.push(stmt);
      }
    }
    const pool = new TestPool();
    pool.delete("nonexistent");
    expect(dealloced).toHaveLength(0);
  });

  it("#delete calls dealloc when statement exists", () => {
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

  it("clear calls dealloc for each statement", () => {
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

  it("reset clears without calling dealloc", () => {
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

  it("each iterates over all entries", () => {
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

  it("evicts oldest when exceeding max size", () => {
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
    expect(pool.has("a")).toBe(false);
    expect(pool.has("b")).toBe(true);
    expect(pool.has("c")).toBe(true);
    expect(dealloced).toEqual(["1"]);
  });

  it("LRU: get moves entry to end", () => {
    const pool = new StatementPool<string>(2);
    pool.set("a", "1");
    pool.set("b", "2");
    pool.get("a"); // touch a, making b the oldest
    pool.set("c", "3"); // should evict b, not a
    expect(pool.has("a")).toBe(true);
    expect(pool.has("b")).toBe(false);
    expect(pool.has("c")).toBe(true);
  });

  it("isKey is an alias for has", () => {
    const pool = new StatementPool<string>();
    pool.set("a", "1");
    expect(pool.isKey("a")).toBe(true);
    expect(pool.isKey("b")).toBe(false);
  });
});

describe("SQLite3 StatementPool integration", () => {
  it("caches prepared statements across execute calls", async () => {
    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter(":memory:");
    const prepareSpy = vi.spyOn((adapter as any).db, "prepare");

    try {
      await adapter.executeMutation(
        'CREATE TABLE "test_pool" ("id" INTEGER PRIMARY KEY, "name" TEXT)',
      );
      await adapter.executeMutation('INSERT INTO "test_pool" ("name") VALUES (?)', ["a"]);
      await adapter.executeMutation('INSERT INTO "test_pool" ("name") VALUES (?)', ["b"]);

      // Same SQL executed twice — db.prepare called once, cached for second
      const selectSql = 'SELECT * FROM "test_pool" WHERE "name" = ?';
      const rows1 = await adapter.execute(selectSql, ["a"]);
      const rows2 = await adapter.execute(selectSql, ["b"]);
      expect(rows1).toHaveLength(1);
      expect(rows1[0].name).toBe("a");
      expect(rows2).toHaveLength(1);
      expect(rows2[0].name).toBe("b");

      // db.prepare should have been called once for the SELECT, not twice
      const selectCalls = prepareSpy.mock.calls.filter((c) => c[0] === selectSql);
      expect(selectCalls).toHaveLength(1);
    } finally {
      prepareSpy.mockRestore();
      adapter.disconnectBang();
    }
  });
});
