/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/transaction_test.rb
 *
 * Note: better-sqlite3 does not expose SQLite's SQLITE_OPEN_SHAREDCACHE flag,
 * so cross-connection read_uncommitted visibility cannot be tested here. Tests
 * that require shared-cache cross-connection reads are kept as close to Rails
 * semantics as possible within that constraint.
 */
import { describe, it, expect, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { TransactionIsolationError } from "../../errors.js";

const SHARED_CACHE_DB = "file::memory:?cache=shared";

const openAdapters: SQLite3Adapter[] = [];
afterEach(() => {
  while (openAdapters.length) {
    try {
      openAdapters.pop()!.close();
    } catch {
      // best-effort
    }
  }
});

function withConn(opts: { sharedCache?: boolean } = {}): SQLite3Adapter {
  const filename = opts.sharedCache ? SHARED_CACHE_DB : ":memory:";
  const adapter = new SQLite3Adapter(filename);
  openAdapters.push(adapter);
  return adapter;
}

function readUncommitted(conn: SQLite3Adapter): boolean {
  const row = (conn as any).db.prepare("PRAGMA read_uncommitted").get() as {
    read_uncommitted: number;
  };
  return row.read_uncommitted !== 0;
}

describe("SQLite3TransactionTest", () => {
  it("shared_cached? is true when cache-mode is enabled", () => {
    const conn = withConn({ sharedCache: true });
    expect(conn.isSharedCache()).toBe(true);
  });

  it("shared_cached? is false when cache-mode is disabled", () => {
    const conn = withConn();
    expect(conn.isSharedCache()).toBe(false);
  });

  it("raises when trying to open a transaction in a isolation level other than `read_uncommitted`", async () => {
    const conn = withConn();
    await expect(conn.beginIsolatedDbTransaction("something")).rejects.toThrow(
      TransactionIsolationError,
    );
  });

  it("raises when trying to open a read_uncommitted transaction but shared-cache mode is turned off", async () => {
    const conn = withConn();
    await expect(conn.beginIsolatedDbTransaction("read_uncommitted")).rejects.toThrow(
      TransactionIsolationError,
    );
  });

  it.skip("opens a `read_uncommitted` transaction", async () => {
    // better-sqlite3 does not expose SQLITE_OPEN_SHAREDCACHE, so cross-connection
    // read_uncommitted visibility cannot be tested.
    const conn1 = withConn({ sharedCache: true });
    conn1.exec(`CREATE TABLE IF NOT EXISTS "zines" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
    await conn1.beginDbTransaction();
    await conn1.executeMutation(`INSERT INTO "zines" ("title") VALUES ('foo')`);

    const conn2 = withConn({ sharedCache: true });
    await conn2.beginIsolatedDbTransaction("read_uncommitted");
    const rows = await conn2.execute(`SELECT * FROM "zines" WHERE title = 'foo'`);
    expect(rows.length).toBeGreaterThan(0);
    await conn2.rollbackDbTransaction();

    await conn1.rollbackDbTransaction();
  });

  it("reset the read_uncommitted PRAGMA when a transaction is rolled back", async () => {
    const conn = withConn({ sharedCache: true });
    expect(readUncommitted(conn)).toBe(false);
    await conn.beginIsolatedDbTransaction("read_uncommitted");
    expect(readUncommitted(conn)).toBe(true);
    await conn.rollbackDbTransaction();
    conn.resetIsolationLevel();
    expect(readUncommitted(conn)).toBe(false);
  });

  it("reset the read_uncommitted PRAGMA when a transaction is committed", async () => {
    const conn = withConn({ sharedCache: true });
    expect(readUncommitted(conn)).toBe(false);
    await conn.beginIsolatedDbTransaction("read_uncommitted");
    expect(readUncommitted(conn)).toBe(true);
    await conn.commitDbTransaction();
    conn.resetIsolationLevel();
    expect(readUncommitted(conn)).toBe(false);
  });

  it("set the read_uncommitted PRAGMA to its previous value", async () => {
    const conn = withConn({ sharedCache: true });
    (conn as any).db.exec("PRAGMA read_uncommitted=ON");
    expect(readUncommitted(conn)).toBe(true);
    await conn.beginIsolatedDbTransaction("read_uncommitted");
    expect(readUncommitted(conn)).toBe(true);
    await conn.commitDbTransaction();
    conn.resetIsolationLevel();
    // restored to previous value (ON)
    expect(readUncommitted(conn)).toBe(true);
  });
});
