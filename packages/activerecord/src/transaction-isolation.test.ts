import { afterEach, describe, expect, it } from "vitest";
import { Base, TransactionIsolationError } from "./index.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";

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
// The skipped tests require PG/MySQL + a second connection (Slot D).
// The un-skipped test below (isolation-when-joining) is adapter-agnostic: the
// framework-level check fires before any DB call, so SQLite is a valid harness.
describe("TransactionIsolationTest", () => {
  it.skip("read uncommitted", () => {
    // BLOCKED: transactions — needs secondConnection wiring
    // ROOT-CAUSE: test uses Tag + Tag2 on separate connections to observe
    //   dirty-read behavior across connections; requires `withSecondAdapter`
    //   helper (Slot D, #1411).
    // SCOPE: ~20 LOC; unblocked when Slot D harness lands.
  });
  it.skip("read committed", () => {
    // BLOCKED: transactions — needs secondConnection wiring
    // ROOT-CAUSE: test uses Tag + Tag2 on separate connections to verify
    //   no dirty read at read-committed isolation level; requires
    //   `withSecondAdapter` helper (Slot D, #1411).
    // SCOPE: ~20 LOC; unblocked when Slot D harness lands.
  });
  it.skip("repeatable read", () => {
    // BLOCKED: transactions — needs secondConnection wiring
    // ROOT-CAUSE: test uses Tag + Tag2 on separate connections to verify
    //   non-repeatable-read protection at repeatable-read isolation level;
    //   requires `withSecondAdapter` helper (Slot D, #1411).
    // SCOPE: ~20 LOC; unblocked when Slot D harness lands.
  });
  it.skip("serializable", () => {
    // BLOCKED: transactions — needs real PG/MySQL adapter
    // ROOT-CAUSE: SQLite3 raises TransactionIsolationError for serializable;
    //   test only runs for adapters with supportsTransactionIsolation()=true.
    //   Needs real PG/MySQL connection via Slot D adapter setup.
    // SCOPE: ~10 LOC; unblocked when Slot D harness lands.
  });
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
