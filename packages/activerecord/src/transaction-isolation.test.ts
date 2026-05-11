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

// Runs when the adapter supports transaction isolation (PG, MySQL — not SQLite3).
// Rails: TransactionIsolationTest
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
  it.skip("setting isolation when starting a nested transaction raises error", () => {
    // BLOCKED: transactions — SavepointTransaction throws plain Error, not TransactionIsolationError
    // ROOT-CAUSE: SavepointTransaction and RestartParentTransaction constructors in
    //   connection-adapters/abstract/transaction.ts throw `new Error(...)` instead of
    //   `new TransactionIsolationError(...)` when isolation is set on a nested txn.
    //   Fix: 2-LOC change (lines 649, 713); deferred from Slot A (zero-src-change slot).
    // SCOPE: ~2 LOC src fix + test body; unblocked in any subsequent src slot.
  });
});
