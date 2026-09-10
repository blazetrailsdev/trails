import { it, expect, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SQLite3Constants } from "../../sqlite-adapter.js";
import { NodeSQLiteAdapter } from "../../connection-adapters/node-sqlite-adapter.js";
import { TransactionIsolationError } from "../../errors.js";

const openAdapters: SQLite3Adapter[] = [];
afterEach(async () => {
  while (openAdapters.length) {
    try {
      await openAdapters.pop()!.close();
    } catch {}
  }
});

function sharedCacheFlags(): number {
  return (
    SQLite3Constants.Open.READWRITE |
    SQLite3Constants.Open.CREATE |
    SQLite3Constants.Open.SHAREDCACHE
  );
}

async function withConn(options: { flags?: number } = {}): Promise<SQLite3Adapter> {
  const adapter = new NodeSQLiteAdapter({ ...options, database: ":memory:" });
  openAdapters.push(adapter);
  await adapter.connectBang();
  return adapter;
}

function readUncommitted(conn: SQLite3Adapter): boolean {
  const row = (conn as any)._rawConnection.prepare("PRAGMA read_uncommitted").get() as {
    read_uncommitted: number;
  };
  return row.read_uncommitted !== 0;
}

describeIfSqlite("SQLite3TransactionTest", () => {
  it("shared_cached? is true when cache-mode is enabled", async () => {
    const conn = await withConn({ flags: sharedCacheFlags() });
    expect(conn.isSharedCache()).toBe(true);
  });

  it("shared_cached? is false when cache-mode is disabled", async () => {
    const conn = await withConn({
      flags: SQLite3Constants.Open.READWRITE | SQLite3Constants.Open.CREATE,
    });
    expect(conn.isSharedCache()).toBe(false);
  });

  it("raises when trying to open a transaction in a isolation level other than `read_uncommitted`", async () => {
    const conn = await withConn();
    await expect(conn.beginIsolatedDbTransaction("something")).rejects.toThrow(
      TransactionIsolationError,
    );
  });

  it("raises when trying to open a read_uncommitted transaction but shared-cache mode is turned off", async () => {
    const conn = await withConn();
    let error: Error | undefined;
    await expect(
      conn.beginIsolatedDbTransaction(":read_uncommitted").catch((e: Error) => {
        error = e;
        throw e;
      }),
    ).rejects.toThrow(Error);

    expect(error?.message).toMatch("You need to enable the shared-cache mode");
  });

  it("opens a `read_uncommitted` transaction", async () => {
    const conn1 = await withConn({ flags: sharedCacheFlags() });
    await conn1.execute(
      `CREATE TABLE IF NOT EXISTS "zines" ("id" INTEGER PRIMARY KEY, "title" TEXT)`,
    );
    await conn1.beginDbTransaction();
    await conn1.executeMutation(`INSERT INTO "zines" ("title") VALUES ('foo')`);

    const conn2 = await withConn({ flags: sharedCacheFlags() });
    await conn2.beginIsolatedDbTransaction(":read_uncommitted");
    const rows = (await conn2.execute(`SELECT * FROM "zines" WHERE title = 'foo'`))!;
    expect(rows.length).toBeGreaterThan(0);
    await conn2.rollbackDbTransaction();

    await conn1.rollbackDbTransaction();
    // eslint-disable-next-line blazetrails/require-table-teardown
    await conn1.execute(`DROP TABLE IF EXISTS "zines"`);
  });

  it("reset the read_uncommitted PRAGMA when a transaction is rolled back", async () => {
    const conn = await withConn({ flags: sharedCacheFlags() });
    expect(readUncommitted(conn)).toBe(false);
    await conn.beginIsolatedDbTransaction(":read_uncommitted");
    expect(readUncommitted(conn)).toBe(true);
    await conn.rollbackDbTransaction();
    await conn.resetIsolationLevel();
    expect(readUncommitted(conn)).toBe(false);
  });

  it("reset the read_uncommitted PRAGMA when a transaction is committed", async () => {
    const conn = await withConn({ flags: sharedCacheFlags() });
    expect(readUncommitted(conn)).toBe(false);
    await conn.beginIsolatedDbTransaction(":read_uncommitted");
    expect(readUncommitted(conn)).toBe(true);
    await conn.commitDbTransaction();
    await conn.resetIsolationLevel();
    expect(readUncommitted(conn)).toBe(false);
  });

  it("set the read_uncommitted PRAGMA to its previous value", async () => {
    const conn = await withConn({ flags: sharedCacheFlags() });
    (conn as any)._rawConnection.exec("PRAGMA read_uncommitted=ON");
    expect(readUncommitted(conn)).toBe(true);
    await conn.beginIsolatedDbTransaction(":read_uncommitted");
    expect(readUncommitted(conn)).toBe(true);
    await conn.commitDbTransaction();
    await conn.resetIsolationLevel();
    expect(readUncommitted(conn)).toBe(true);
  });
});
