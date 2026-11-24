import { SQLite3 } from "@blazetrails/sqlite3";
import { describe, it, expect } from "vitest";
import { assertNotEmpty } from "@blazetrails/activesupport/testing/assertions";
import { SQLite3Adapter } from "../../../../lib/connection-adapters/sqlite3-adapter.js";
import { Rollback, TransactionIsolationError } from "../../../../lib/errors.js";
import { inMemoryDb } from "../../../support/adapter-helper.js";
import { ambientPoolConfiguration } from "../../../support/test-adapter.js";
import { currentAdapter } from "../../../support/adapter-helper.js";

function sharedCacheFlags(): number {
  return (
    SQLite3.Constants.Open.READWRITE |
    SQLite3.Constants.Open.CREATE |
    SQLite3.Constants.Open.SHAREDCACHE
  );
}

async function withConnection(
  options: { flags?: number },
  block: (conn: SQLite3Adapter) => Promise<void>,
): Promise<void> {
  const database = inMemoryDb() ? ":memory:" : (ambientPoolConfiguration().database as string);
  const conn = new SQLite3Adapter({ adapter: "node-sqlite", ...options, database });
  try {
    await conn.connectBang();
    await block(conn);
  } finally {
    await conn.disconnectBang();
  }
}

async function readUncommitted(conn: SQLite3Adapter): Promise<boolean> {
  return (await (conn as any)._rawConnection.getFirstValue("PRAGMA read_uncommitted")) !== 0;
}

describe.runIf(currentAdapter("SQLite3Adapter"))("SQLite3TransactionTest", () => {
  it("shared_cached? is true when cache-mode is enabled", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      expect(conn.isSharedCache()).toBeTruthy();
    });
  });

  it("shared_cached? is false when cache-mode is disabled", async () => {
    await withConnection(
      {
        flags: SQLite3.Constants.Open.READWRITE | SQLite3.Constants.Open.CREATE,
      },
      async (conn) => {
        expect(conn.isSharedCache()).toBeFalsy();
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
      expect(await readUncommitted(conn)).toBeFalsy();
      await conn.beginIsolatedDbTransaction(":read_uncommitted");
      expect(await readUncommitted(conn)).toBeTruthy();
      await conn.rollbackDbTransaction();
      await conn.resetIsolationLevel();
      expect(await readUncommitted(conn)).toBeFalsy();
    });
  });

  it("reset the read_uncommitted PRAGMA when a transaction is committed", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      expect(await readUncommitted(conn)).toBeFalsy();
      await conn.beginIsolatedDbTransaction(":read_uncommitted");
      expect(await readUncommitted(conn)).toBeTruthy();
      await conn.commitDbTransaction();
      await conn.resetIsolationLevel();
      expect(await readUncommitted(conn)).toBeFalsy();
    });
  });

  it("set the read_uncommitted PRAGMA to its previous value", async () => {
    await withConnection({ flags: sharedCacheFlags() }, async (conn) => {
      await (conn as any)._rawConnection.setReadUncommitted(true);
      expect(await readUncommitted(conn)).toBeTruthy();
      await conn.beginIsolatedDbTransaction(":read_uncommitted");
      expect(await readUncommitted(conn)).toBeTruthy();
      await conn.commitDbTransaction();
      await conn.resetIsolationLevel();
      expect(await readUncommitted(conn)).toBeTruthy();
    });
  });
});
