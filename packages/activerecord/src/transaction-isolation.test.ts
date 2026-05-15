import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base, TransactionIsolationError } from "./index.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./adapters/postgresql/test-helper.js";
import { withSecondAdapter } from "./test-helpers/second-connection.js";

const openAdapters: SQLite3Adapter[] = [];

function makeSQLiteTag() {
  const adapter = new SQLite3Adapter(":memory:");
  openAdapters.push(adapter);
  adapter.exec("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
  class Tag extends Base {
    static {
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }
  return { Tag, adapter };
}

afterEach(() => {
  for (const a of openAdapters.splice(0)) a.close();
});

// Runs when the adapter does NOT support transaction isolation (or is SQLite3).
// Rails: TransactionIsolationUnsupportedTest
describe("TransactionIsolationUnsupportedTest", () => {
  it("setting the isolation level raises an error", async () => {
    // SQLite3 only supports read_uncommitted; serializable raises immediately.
    const { Tag } = makeSQLiteTag();
    await expect(
      Tag.transaction(
        async () => {
          await Tag.count(); // forces lazy-transaction materialization
        },
        { isolation: "serializable" },
      ),
    ).rejects.toThrow(TransactionIsolationError);
  });
});

// Rails: TransactionIsolationTest — guarded by supports_transaction_isolation? && !SQLite3.
// The two tests below (isolation-when-joining + nested-transaction) are
// adapter-agnostic: the framework-level isolation check fires before any DB
// call, so the SQLite harness is sufficient. The four PG-required cases
// (read uncommitted / read committed / repeatable read / serializable) live
// in the `describeIfPg("TransactionIsolationTest", ...)` block at the bottom
// of this file.
describe("TransactionIsolationTest", () => {
  it("setting isolation when joining a transaction raises an error", async () => {
    // When already inside a transaction, trying to join with an isolation level set
    // must raise TransactionIsolationError — same adapter-agnostic check as Rails.
    const { Tag } = makeSQLiteTag();
    await Tag.transaction(async () => {
      await expect(Tag.transaction(async () => {}, { isolation: "serializable" })).rejects.toThrow(
        TransactionIsolationError,
      );
    });
  });
  it("setting isolation when starting a nested transaction raises error", async () => {
    const { Tag } = makeSQLiteTag();
    await Tag.transaction(async () => {
      // requiresNew: true forces a SavepointTransaction (or RestartParentTransaction),
      // exercising the constructor-level isolation check distinct from the join-path check.
      await expect(
        Tag.transaction(async () => {}, { requiresNew: true, isolation: "serializable" }),
      ).rejects.toThrow(TransactionIsolationError);
    });
  });
});

// Rails: TransactionIsolationTest, guarded by supports_transaction_isolation? && !SQLite3.
// Mirrors vendor/rails/activerecord/test/cases/transaction_isolation_test.rb. Uses two
// independent PostgreSQLAdapter instances (via withSecondAdapter) as the second
// connection — Rails uses pool checkout; we use a fresh adapter for full isolation.
describeIfPg("TransactionIsolationTest", () => {
  const TABLE = "pg_iso_tags";
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "${TABLE}"`);
    await adapter.exec(`CREATE TABLE "${TABLE}" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "${TABLE}"`);
    await adapter.close();
  });

  function tagModels(adapter1: PostgreSQLAdapter, adapter2: PostgreSQLAdapter) {
    class Tag extends Base {
      static {
        this._tableName = TABLE;
        this.attribute("name", "string");
        this.adapter = adapter1;
      }
    }
    class Tag2 extends Base {
      static {
        this._tableName = TABLE;
        this.attribute("name", "string");
        this.adapter = adapter2;
      }
    }
    return { Tag, Tag2 };
  }

  // PG aliases READ UNCOMMITTED to READ COMMITTED — Rails notes this test only
  // asserts that the second connection's committed insert becomes visible.
  it("read uncommitted", async () => {
    await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
      const { Tag, Tag2 } = tagModels(adapter, adapter2);
      await Tag.transaction(
        async () => {
          expect(await Tag.count()).toBe(0);
          await Tag2.create({});
          expect(await Tag.count()).toBe(1);
        },
        { isolation: "read_uncommitted" },
      );
    });
  });

  // A dirty read must not happen: Tag2's uncommitted insert is invisible to Tag.
  it("read committed", async () => {
    await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
      const { Tag, Tag2 } = tagModels(adapter, adapter2);
      await Tag.transaction(
        async () => {
          expect(await Tag.count()).toBe(0);
          await Tag2.transaction(async () => {
            await Tag2.create({});
            expect(await Tag.count()).toBe(0);
          });
        },
        { isolation: "read_committed" },
      );
      expect(await Tag.count()).toBe(1);
    });
  });

  // A non-repeatable read must not happen: a committed update from the second
  // connection is invisible to the first connection's repeatable-read snapshot.
  it("repeatable read", async () => {
    await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
      const { Tag, Tag2 } = tagModels(adapter, adapter2);
      const tag = await Tag.create({ name: "jon" });

      await Tag.transaction(
        async () => {
          await tag.reload();
          const t2 = await Tag2.find(tag.id);
          await t2.update({ name: "emily" });

          await tag.reload();
          expect(tag.name).toBe("jon");
        },
        { isolation: "repeatable_read" },
      );

      await tag.reload();
      expect(tag.name).toBe("emily");
    });
  });

  // No-error smoke test for serializable — DBs enforce serializability differently.
  it("serializable", async () => {
    await withSecondAdapter(PG_TEST_URL, async (adapter2) => {
      const { Tag } = tagModels(adapter, adapter2);
      await Tag.transaction(
        async () => {
          await Tag.create({});
        },
        { isolation: "serializable" },
      );
    });
  });
});
