import { it, expect } from "vitest";
import { assertNotEmpty } from "@blazetrails/activesupport";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { SQLite3Constants } from "../../sqlite-adapter.js";
import { NodeSQLiteAdapter } from "../../connection-adapters/node-sqlite-adapter.js";
import { Rollback, TransactionIsolationError } from "../../errors.js";
import { inMemoryDb } from "../../support/adapter-helper.js";
import { ambientPoolConfiguration } from "../../test-adapter.js";

function sharedCacheFlags(): number {
  return (
    SQLite3Constants.Open.READWRITE |
    SQLite3Constants.Open.CREATE |
    SQLite3Constants.Open.SHAREDCACHE
  );
}

async function withConnection(
  options: { flags?: number },
  block: (conn: SQLite3Adapter) => Promise<void>,
): Promise<void> {
  const database = inMemoryDb() ? ":memory:" : (ambientPoolConfiguration().database as string);
  const conn = new NodeSQLiteAdapter({ ...options, database });
  try {
    await conn.connectBang();
    await block(conn);
  } finally {
    await conn.disconnectBang();
  }
}

function readUncommitted(conn: SQLite3Adapter): boolean {
  const row = (conn as any)._rawConnection.prepare("PRAGMA read_uncommitted").get() as {
    read_uncommitted: number;
  };
  return row.read_uncommitted !== 0;
}

describeIfSqlite("SQLite3TransactionTest", () => {
  it("shared_cached? is true when cache-mode is enabled", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      expect(conn.isSharedCache()).toBe(true);
    });
  });

  it("shared_cached? is false when cache-mode is disabled", async () => {
    await withConnection(
      {
        flags: SQLite3Constants.Open.READWRITE | SQLite3Constants.Open.CREATE,
      },
      async (conn) => {
        expect(conn.isSharedCache()).toBe(false);
      },
    );
  });

  it("raises when trying to open a transaction in a isolation level other than `read_uncommitted`", async () => {
    await withConnection({}, async (conn) => {
      await expect(conn.beginIsolatedDbTransaction("something")).rejects.toThrow(
        TransactionIsolationError,
      );
    });
  });

  it("raises when trying to open a read_uncommitted transaction but shared-cache mode is turned off", async () => {
    await withConnection({}, async (conn) => {
      let error: Error | undefined;
      await expect(
        conn.beginIsolatedDbTransaction(":read_uncommitted").catch((e: Error) => {
          error = e;
          throw e;
        }),
      ).rejects.toThrow(Error);

      expect(error?.message).toMatch("You need to enable the shared-cache mode");
    });
  });

  it("opens a `read_uncommitted` transaction", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn1) => {
      if (inMemoryDb())
        await conn1.createTable("zines", {}, (t) => {
          t.column("title", "string");
        });
      await conn1.transaction(async () => {
        await conn1.transactionManager.materializeTransactions();
        await conn1.execute("INSERT INTO zines (title) VALUES ('foo')");

        await withConnection({ flags: sharedCacheFlags() }, async (conn2) => {
          await conn2.transaction(
            async () => {
              assertNotEmpty(await conn2.execute("SELECT * FROM zines WHERE title = 'foo'"));
            },
            { joinable: false, isolation: ":read_uncommitted" },
          );
        });

        throw new Rollback();
      });
    });
  });

  it("reset the read_uncommitted PRAGMA when a transaction is rolled back", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      expect(readUncommitted(conn)).toBe(false);
      await conn.beginIsolatedDbTransaction(":read_uncommitted");
      expect(readUncommitted(conn)).toBe(true);
      await conn.rollbackDbTransaction();
      await conn.resetIsolationLevel();
      expect(readUncommitted(conn)).toBe(false);
    });
  });

  it("reset the read_uncommitted PRAGMA when a transaction is committed", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      expect(readUncommitted(conn)).toBe(false);
      await conn.beginIsolatedDbTransaction(":read_uncommitted");
      expect(readUncommitted(conn)).toBe(true);
      await conn.commitDbTransaction();
      await conn.resetIsolationLevel();
      expect(readUncommitted(conn)).toBe(false);
    });
  });

  it("set the read_uncommitted PRAGMA to its previous value", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      (conn as any)._rawConnection.exec("PRAGMA read_uncommitted=ON");
      expect(readUncommitted(conn)).toBe(true);
      await conn.beginIsolatedDbTransaction(":read_uncommitted");
      expect(readUncommitted(conn)).toBe(true);
      await conn.commitDbTransaction();
      await conn.resetIsolationLevel();
      expect(readUncommitted(conn)).toBe(true);
    });
  });
});
